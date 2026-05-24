import * as readline from 'readline';

interface TypeInfo {
  kind: 'primitive' | 'array' | 'object' | 'union';
  primitiveTypes?: Set<string>;
  arrayElementTypes?: Set<string>;
  objectName?: string;
}

interface InterfaceProperty {
  types: TypeInfo;
  isOptional: boolean;
}

interface InterfaceDefinition {
  name: string;
  properties: Map<string, InterfaceProperty>;
}

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false
});

const lines: string[] = [];

rl.on('line', (line) => {
  lines.push(line);
});

rl.on('close', () => {
  processInput(lines);
});

function processInput(lines: string[]): void {
  const T = parseInt(lines[0]);
  const results: string[] = [];

  let lineIdx = 1;
  for (let t = 0; t < T; t++) {
    const rootTypeName = lines[lineIdx++];
    const jsonStr = lines[lineIdx++];
    const json = JSON.parse(jsonStr);

    const result = generateTypeDeclaration(rootTypeName, json);
    results.push(result);
  }

  process.stdout.write(results.join('\n---\n') + '\n');
}

function generateTypeDeclaration(rootTypeName: string, json: any[]): string {
  const interfaces = new Map<string, InterfaceDefinition>();
  const usedNames = new Set<string>([rootTypeName]);

  // Process all objects in the array
  const mergedProps = new Map<string, TypeInfo[]>();
  const propPresence = new Map<string, number>(); // count of objects where key is present

  for (const obj of json) {
    if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
      for (const key in obj) {
        if (!mergedProps.has(key)) {
          mergedProps.set(key, []);
          propPresence.set(key, 0);
        }
        mergedProps.get(key)!.push(inferType(obj[key], key, interfaces, usedNames));
        propPresence.set(key, propPresence.get(key)! + 1);
      }
    }
  }

  // Build root interface
  const rootProps = new Map<string, InterfaceProperty>();
  for (const [key, typeInfos] of mergedProps) {
    const mergedType = mergeTypeInfos(typeInfos);
    const isOptional = propPresence.get(key)! < json.length;
    rootProps.set(key, { types: mergedType, isOptional });
  }

  interfaces.set(rootTypeName, { name: rootTypeName, properties: rootProps });

  // Output all interfaces in sorted order
  const sortedNames = Array.from(interfaces.keys()).sort(compareASCII);
  const output: string[] = [];

  for (const name of sortedNames) {
    const iface = interfaces.get(name)!;
    output.push(formatInterface(iface));
  }

  return output.join('\n\n');
}

function compareASCII(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function inferType(
  value: any,
  parentKey: string,
  interfaces: Map<string, InterfaceDefinition>,
  usedNames: Set<string>
): TypeInfo {
  if (value === null) {
    return { kind: 'primitive', primitiveTypes: new Set(['null']) };
  }

  if (typeof value === 'string') {
    return { kind: 'primitive', primitiveTypes: new Set(['string']) };
  }

  if (typeof value === 'number') {
    return { kind: 'primitive', primitiveTypes: new Set(['number']) };
  }

  if (typeof value === 'boolean') {
    return { kind: 'primitive', primitiveTypes: new Set(['boolean']) };
  }

  if (Array.isArray(value)) {
    const elementTypes = new Set<string>();
    const objectElements: any[] = [];

    for (const elem of value) {
      if (typeof elem === 'object' && elem !== null && !Array.isArray(elem)) {
        objectElements.push(elem);
      } else {
        const elemType = inferType(elem, parentKey, interfaces, usedNames);
        elementTypes.add(typeInfoToString(elemType));
      }
    }

    // Handle object elements
    if (objectElements.length > 0) {
      const ifaceName = allocateInterfaceName(parentKey, usedNames);
      const mergedProps = new Map<string, TypeInfo[]>();

      for (const obj of objectElements) {
        for (const key in obj) {
          if (!mergedProps.has(key)) {
            mergedProps.set(key, []);
          }
          mergedProps.get(key)!.push(inferType(obj[key], key, interfaces, usedNames));
        }
      }

      const finalProps = new Map<string, InterfaceProperty>();
      for (const [key, typeInfos] of mergedProps) {
        const mergedType = mergeTypeInfos(typeInfos);
        finalProps.set(key, { types: mergedType, isOptional: false });
      }

      interfaces.set(ifaceName, { name: ifaceName, properties: finalProps });
      elementTypes.add(ifaceName);
    }

    return { kind: 'array', arrayElementTypes: elementTypes };
  }

  if (typeof value === 'object' && value !== null) {
    const ifaceName = allocateInterfaceName(parentKey, usedNames);
    const props = new Map<string, TypeInfo[]>();

    for (const key in value) {
      if (!props.has(key)) {
        props.set(key, []);
      }
      props.get(key)!.push(inferType(value[key], key, interfaces, usedNames));
    }

    const finalProps = new Map<string, InterfaceProperty>();
    for (const [key, typeInfos] of props) {
      const mergedType = mergeTypeInfos(typeInfos);
      finalProps.set(key, { types: mergedType, isOptional: false });
    }

    interfaces.set(ifaceName, { name: ifaceName, properties: finalProps });

    return { kind: 'object', objectName: ifaceName };
  }

  return { kind: 'primitive', primitiveTypes: new Set(['unknown']) };
}

function allocateInterfaceName(baseKey: string, usedNames: Set<string>): string {
  const baseName = baseKey[0].toUpperCase() + baseKey.slice(1);
  let name = baseName;
  let counter = 2;

  while (usedNames.has(name)) {
    name = baseName + counter;
    counter++;
  }

  usedNames.add(name);
  return name;
}

function mergeTypeInfos(typeInfos: TypeInfo[]): TypeInfo {
  const allTypes = new Set<string>();

  for (const info of typeInfos) {
    if (info.kind === 'primitive') {
      for (const prim of info.primitiveTypes!) {
        allTypes.add(prim);
      }
    } else if (info.kind === 'array') {
      for (const elem of info.arrayElementTypes!) {
        allTypes.add(elem + '[]');
      }
    } else if (info.kind === 'object') {
      allTypes.add(info.objectName!);
    }
  }

  const sorted = Array.from(allTypes).sort(compareTypeStrings);

  if (sorted.length === 1) {
    const typeStr = sorted[0];
    if (typeStr.endsWith('[]')) {
      return { kind: 'array', arrayElementTypes: new Set([typeStr.slice(0, -2)]) };
    } else if (typeStr === 'null' || typeStr === 'string' || typeStr === 'number' || typeStr === 'boolean' || typeStr === 'unknown') {
      return { kind: 'primitive', primitiveTypes: new Set([typeStr]) };
    } else {
      return { kind: 'object', objectName: typeStr };
    }
  }

  return { kind: 'union', primitiveTypes: new Set(sorted) };
}

function compareTypeStrings(a: string, b: string): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const codeA = a.charCodeAt(i);
    const codeB = b.charCodeAt(i);
    if (codeA !== codeB) {
      return codeA - codeB;
    }
  }

  return a.length - b.length;
}

function typeInfoToString(info: TypeInfo): string {
  if (info.kind === 'primitive') {
    const sorted = Array.from(info.primitiveTypes!).sort(compareTypeStrings);
    return sorted[0];
  } else if (info.kind === 'array') {
    const sorted = Array.from(info.arrayElementTypes!).sort(compareTypeStrings);
    if (sorted.length === 1) {
      return sorted[0];
    } else {
      return '(' + sorted.join(' | ') + ')';
    }
  } else if (info.kind === 'object') {
    return info.objectName!;
  } else {
    const sorted = Array.from(info.primitiveTypes!).sort(compareTypeStrings);
    return sorted.join(' | ');
  }
}

function formatTypeString(info: TypeInfo): string {
  if (info.kind === 'primitive') {
    return Array.from(info.primitiveTypes!)[0];
  } else if (info.kind === 'array') {
    const sorted = Array.from(info.arrayElementTypes!).sort(compareTypeStrings);
    if (sorted.length === 0) {
      return 'unknown[]';
    } else if (sorted.length === 1) {
      return sorted[0] + '[]';
    } else {
      return '(' + sorted.join(' | ') + ')[]';
    }
  } else if (info.kind === 'object') {
    return info.objectName!;
  } else {
    const sorted = Array.from(info.primitiveTypes!).sort(compareTypeStrings);
    return sorted.join(' | ');
  }
}

function formatInterface(iface: InterfaceDefinition): string {
  if (iface.properties.size === 0) {
    return `export interface ${iface.name} {}`;
  }

  const lines: string[] = [`export interface ${iface.name} {`];

  const sortedProps = Array.from(iface.properties.entries()).sort((a, b) =>
    compareASCII(a[0], b[0])
  );

  for (const [key, prop] of sortedProps) {
    const optional = prop.isOptional ? '?' : '';
    const typeStr = formatTypeString(prop.types);
    lines.push(`  ${key}${optional}: ${typeStr};`);
  }

  lines.push('}');

  return lines.join('\n');
}
