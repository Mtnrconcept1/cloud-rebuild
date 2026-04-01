import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'src/components/home/CuisineCategoryStrip.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// The regex will match the specific background circles
const regex = /\s*<circle cx="32" cy="32" r="30" fill="[^"]+" \/>/g;
content = content.replace(regex, '');

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Background circles removed.');
