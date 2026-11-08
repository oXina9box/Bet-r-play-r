# Live results

`npm run sync:live` reads the current `data/betrplayr.json` and adds its round results to the three master spreadsheets in `live results/`. Each game has matching `.ods` and `.xlsx` files. ExcelJS is installed with application dependencies; LibreOffice must be available as `libreoffice` on the system path.

Starting a new Sic Bo, The Kickoff, or Teen Patti session also synchronizes the completed session. Original application history remains in place. If synchronization fails, restore the local server and run `npm run sync:live` after its data file is saved.

Rows are identified by the exact millisecond timestamp and show UTC date and time. Results from all sites and sessions share the game sheet. No wagers or financial results are exported. Keep both spreadsheet files together; back up the folder before manually editing it.

Only one process can update a game's sheets at a time. If synchronization reports that it is already running, retry after the other process finishes. After an interrupted process, remove that game's hidden `.lock` file only after confirming no synchronization is running.
