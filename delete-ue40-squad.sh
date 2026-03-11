#!/bin/bash
docker exec trainingsplan-trainingsplan-1 node -e "
const Database = require('better-sqlite3');
const db = new Database('/app/data/trainingsplan.db');

const rows = db.prepare(\"SELECT ts.id, t.name, ts.year, ts.gender, ts.count FROM team_squad ts JOIN teams t ON ts.team_id = t.id WHERE t.name LIKE '%40%'\").all();
console.log('Gefundene Eintraege:');
console.log(rows);

db.prepare(\"DELETE FROM team_squad WHERE team_id = (SELECT id FROM teams WHERE name LIKE '%40%')\").run();
console.log('Alle Kader-Eintraege der Ü40 wurden geloescht.');
"
