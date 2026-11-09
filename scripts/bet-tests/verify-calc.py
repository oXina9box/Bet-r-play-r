#!/usr/bin/env python3
"""Recalculate an isolated Calc document; inspect real values without GUI."""
import argparse
import json
import pathlib
import subprocess
import tempfile
import time
import uuid
import uno


def property_value(name, value):
    prop = uno.createUnoStruct('com.sun.star.beans.PropertyValue')
    prop.Name, prop.Value = name, value
    return prop


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('workbook')
    parser.add_argument('--output', required=True)
    parser.add_argument('--set', action='append', default=[])
    parser.add_argument('--save', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='bet-calc-') as directory:
        pipe = 'bet_' + uuid.uuid4().hex
        process = subprocess.Popen([
            'libreoffice', '-env:UserInstallation=' + pathlib.Path(directory).as_uri(),
            '--headless', '--nologo', '--nodefault', '--norestore',
            '--accept=pipe,name=' + pipe + ';urp;StarOffice.ServiceManager'],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        document = None
        try:
            local = uno.getComponentContext()
            resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
            remote = None
            for _ in range(200):
                if process.poll() is not None:
                    raise RuntimeError('LibreOffice stopped: ' + process.stderr.read().decode()[-1000:])
                try:
                    remote = resolver.resolve('uno:pipe,name=' + pipe + ';urp;StarOffice.ComponentContext')
                    break
                except Exception:
                    time.sleep(0.1)
            if remote is None:
                raise RuntimeError('Cannot connect to isolated LibreOffice process')
            desktop = remote.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', remote)
            document = desktop.loadComponentFromURL(pathlib.Path(args.workbook).resolve().as_uri(), '_blank', 0,
                (property_value('Hidden', True), property_value('UpdateDocMode', 3)))
            if document is None:
                raise RuntimeError('Calc could not open workbook')
            for edit in args.set:
                reference, encoded = edit.split('=', 1)
                sheet, address = reference.split('!', 1)
                value = json.loads(encoded)
                cell = document.Sheets.getByName(sheet).getCellRangeByName(address)
                if isinstance(value, bool):
                    cell.setFormula('=TRUE()' if value else '=FALSE()')
                elif isinstance(value, (int, float)):
                    cell.setValue(value)
                else:
                    cell.setString(str(value))
            document.calculateAll()
            output = {}
            for sheet in document.Sheets:
                if sheet.Name in ['Guide', 'Rounds', 'Scenarios', 'Rules', 'Overrides', 'Ladders']:
                    continue
                cursor = sheet.createCursor()
                cursor.gotoEndOfUsedArea(False)
                last = cursor.RangeAddress.EndRow
                values = sheet.getCellRangeByPosition(0, 0, 30 if sheet.Name != 'Comparison' else 11, last).getDataArray()
                errors = []
                for row in range(last + 1):
                    for col in range(31 if sheet.Name != 'Comparison' else 12):
                        cell = sheet.getCellByPosition(col, row)
                        error = cell.getError()
                        if error:
                            errors.append({'row': row+1, 'column': col+1, 'error': error, 'formula': cell.getFormula()})
                output[sheet.Name] = {'values': values, 'errors': errors}
            pathlib.Path(args.output).write_text(json.dumps(output))
            if args.save:
                document.store()
            print('CALC_RECALCULATED ' + str(sum(len(s['errors']) for s in output.values())) + ' errors')
        finally:
            if document is not None:
                document.close(True)
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == '__main__':
    main()
