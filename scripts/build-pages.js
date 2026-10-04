const { copyFileSync, mkdirSync, rmSync } = require('node:fs');
const { join } = require('node:path');

// Publish only the public application: never tests, dependencies, or repository metadata.
const files = ['index.html', 'style.css', 'map.js', 'marker-data.js', 'map-services.js',
    'favicon.svg', 'manifest.json', 'config.json'];
const output = '_site';
rmSync(output, { recursive: true, force: true });
mkdirSync(output);
for (const file of files) copyFileSync(file, join(output, file));
console.log(`Prepared ${files.length} public files in ${output}/`);
