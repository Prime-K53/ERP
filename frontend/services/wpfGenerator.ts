export const generateWpfFile = async (filePath: string, context: string): Promise<string> => {
  return `// WPF file synthesis requires a local AI engine.\n// Requested file: ${filePath}\n// Context snapshot:\n// ${String(context || '').split('\n').join('\n// ')}`;
};
