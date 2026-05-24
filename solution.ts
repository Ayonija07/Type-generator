import * as readline from 'readline';

interface TypeInfo {
  kind: 'primitive' | 'array' | 'object';
  value?: string; // for primitives and object interface names
  elementTypes?: Set<string>; // for arrays
}

interface InterfaceInfo {
  name: string;
  properties: Map<string, TypeInfo>;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

const lines: string[] = [];

rl.on('line', (line) => {
  lines.push(line);
});

rl.on('close', () => {
  processInput(lines);
});

function processInput(lines: string[]) {
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
  
  console.log(results.join('\n---\n'));
}

function generateTypeDeclaration(rootTypeName: string, json: any[]): string {
  const interfaces = new Map<string, InterfaceInfo>();
  const usedNames = new Set<string>();
  usedNames.add(rootTypeName);
  
  // Build the type tree
  const rootInfo = buildTypeInfo(json, rootTypeName, interfaces, usedNames);
  
  // Output interfaces in sorted order
  const sortedNames = Array.from(interfaces.keys()).sort();
  const output: string[] = [];
  
  for (const name of sortedNames) {
    const iface = interfaces.get(name)!;
    output.push(formatInterface(iface));
  }
  
  return output.join('\n\n');
}

function buildTypeInfo(
  json: any[],
  rootName: string,
  interfaces: Map<string, InterfaceInfo>,
  usedNames: Set<string>
): TypeInfo {
  if (json.length === 0) {
    interfaces.set(rootName, { name: rootName, properties: new Map() });
    return { kind: 'object', value: rootName };
  }
  
  const mergedProps = new Map<string, TypeInfo[]>();
  
  // Collect all properties and their types
  for (const obj of json) {
    if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
      for (const key in obj) {
        if (!mergedProps.has(key)) {
          mergedProps.set(key, []);
        }
        mergedProps.get(key)!.push(inferType(obj[key], key, interfaces, usedNames));
      }
    }
  }
  
  // Merge properties
  const finalProps = new Map<string, TypeInfo>();
  for (const [key, typeInfos] of mergedProps) {
    finalProps.set(key, mergeTypeInfos(typeInfos));
  }
  
  interfaces.set(rootName, { name: rootName, properties: finalProps });
  return { kind: 'object', value: rootName };
}

function inferType(
  value: any,
  parentKey: string,
  interfaces: Map<string, InterfaceInfo>,
  usedNames: Set<string>
): TypeInfo {
  if (value === null) {
    return { kind: 'primitive', value: 'null' };
  }
  
  if (typeof value === 'string') {
    return { kind: 'primitive', value: 'string' };
  }
  
  if (typeof value === 'number') {
    return { kind: 'primitive', value: 'number' };
  }
  
  if (typeof value === 'boolean') {
    return { kind: 'primitive', value: 'boolean' };
  }
  
  if (Array.isArray(value)) {
    const elementTypes = new Set<string>();
    for (const elem of value) {
      const elemType = inferType(elem, parentKey, interfaces, usedNames);
      elementTypes.add(typeToString(elemType, interfaces));
    }
    return { kind: 'array', elementTypes };
  }
  
  if (typeof value === 'object' && value !== null) {
    // Create a named interface for this object
    const ifaceName = getInterfaceName(parentKey, interfaces, usedNames);
    const props = new Map<string, TypeInfo>();
    
    for (const key in value) {
      props.set(key, inferType(value[key], key, interfaces, usedNames));
    }
    
    interfaces.set(ifaceName, { name: ifaceName, properties: props });
    usedNames.add(ifaceName);
    
    return { kind: 'object', value: ifaceName };
  }
  
  return { kind: 'primitive', value: 'unknown' };
}

function getInterfaceName(key: string, interfaces: Map<string, InterfaceInfo>, usedNames: Set<string>): string {
  const baseName = key[0].toUpperCase() + key.slice(1);
  let name = baseName;
  let counter = 2;
  
  while (usedNames.has(name)) {
    name = baseName + counter;
    counter++;
  }
  
  return name;
}

function mergeTypeInfos(typeInfos: TypeInfo[]): TypeInfo {
  const primitives = new Set<string>();
  const arrays: Set<string>[] = [];
  const objects: string[] = [];
  
  for (const info of typeInfos) {
    if (info.kind === 'primitive') {
      primitives.add(info.value!);
    } else if (info.kind === 'array') {
      arrays.push(info.elementTypes!);
    } else if (info.kind === 'object') {
      objects.push(info.value!);
    }
  }
  
  const unionTypes = new Set<string>();
  
  // Add array type
  if (arrays.length > 0) {
    const allElements = new Set<string>();
    for (const arr of arrays) {
      for (const elem of arr) {
        allElements.add(elem);
      }
    }
    
    if (allElements.size === 0) {
      unionTypes.add('unknown[]');
    } else {
      const sorted = Array.from(allElements).sort();
      if (sorted.length === 1) {
        unionTypes.add(sorted[0] + '[]');
      } else {
        unionTypes.add('(' + sorted.join(' | ') + ')[]');
      }
    }
  }
  
  // Add object types
  for (const obj of objects) {
    unionTypes.add(obj);
  }
  
  // Add primitives
  for (const prim of primitives) {
    unionTypes.add(prim);
  }
  
  const sorted = Array.from(unionTypes).sort();
  
  if (sorted.length === 1) {
    const typeStr = sorted[0];
    if (typeStr.endsWith('[]')) {
      return { kind: 'array', elementTypes: new Set([typeStr]) };
    }
    return { kind: 'primitive', value: typeStr };
  }
  
  return { kind: 'primitive', value: sorted.join(' | ') };
}

function typeToString(info: TypeInfo, interfaces: Map<string, InterfaceInfo>): string {
  if (info.kind === 'primitive') {
    return info.value!;
  } else if (info.kind === 'array') {
    const sorted = Array.from(info.elementTypes!).sort();
    if (sorted.length === 1) {
      return sorted[0] + '[]';
    } else {
      return '(' + sorted.join(' | ') + ')[]';
    }
  } else {
    return info.value!;
  }
}

function formatInterface(iface: InterfaceInfo): string {
  if (iface.properties.size === 0) {
    return `export interface ${iface.name} {}`;
  }
  
  const lines: string[] = [`export interface ${iface.name} {`];
  
  const sortedProps = Array.from(iface.properties.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  
  for (const [key, typeInfo] of sortedProps) {
    const typeStr = typeToString(typeInfo, new Map());
    lines.push(`  ${key}: ${typeStr};`);
  }
  
  lines.push('}');
  
  return lines.join('\n');
}
