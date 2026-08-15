
export { exportToCSV } from '../utils/helpers';


function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

export const parseCSV = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) {
        resolve([]);
        return;
      }

      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length < 2) {
        resolve([]);
        return;
      }

      const rawFirstLine = lines[0].replace(/^\uFEFF/, '');
      const headers = parseCSVLine(rawFirstLine).map(h => h.trim());
      
      const result = lines.slice(1).map(line => {
        const values = parseCSVLine(line).map(v => v.trim());
        const obj: any = {};
        headers.forEach((header, index) => {
          const value = values[index];
          obj[header] = value;
          obj[header.toLowerCase()] = value;
        });
        return obj;
      });

      resolve(result);
    };

    reader.onerror = (error) => reject(error);
    reader.readAsText(file);
  });
};
