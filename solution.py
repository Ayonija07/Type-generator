#!/usr/bin/env python3
# Input : line 1 = T; then per case: line A = root name, line B = compact JSON.
# Output: per-case blocks joined by a line `---`, ending with one '\n'.

import sys
import json
from typing import Any, Dict, Set, List
from dataclasses import dataclass, field


@dataclass
class TypeInfo:
    kind: str  # 'primitive', 'array', 'object', 'union'
    primitive_types: Set[str] = field(default_factory=set)
    array_element_types: Set[str] = field(default_factory=set)
    object_name: str = ""


@dataclass
class InterfaceProperty:
    types: TypeInfo
    is_optional: bool


@dataclass
class InterfaceDefinition:
    name: str
    properties: Dict[str, InterfaceProperty] = field(default_factory=dict)


def allocate_interface_name(base_key: str, used_names: Set[str]) -> str:
    """Allocate a unique interface name based on the key."""
    base_name = base_key[0].upper() + base_key[1:]
    name = base_name
    counter = 2
    
    while name in used_names:
        name = base_name + str(counter)
        counter += 1
    
    used_names.add(name)
    return name


def compare_type_strings(a: str, b: str) -> tuple:
    """Return tuple of ord values for proper ASCII comparison."""
    return tuple(ord(c) for c in a)


def infer_type(
    value: Any,
    parent_key: str,
    interfaces: Dict[str, InterfaceDefinition],
    used_names: Set[str]
) -> TypeInfo:
    """Infer the TypeInfo from a JSON value."""
    
    if value is None:
        return TypeInfo(kind='primitive', primitive_types={'null'})
    
    if isinstance(value, bool):  # Must check before int since bool is subclass of int
        return TypeInfo(kind='primitive', primitive_types={'boolean'})
    
    if isinstance(value, (int, float)):
        return TypeInfo(kind='primitive', primitive_types={'number'})
    
    if isinstance(value, str):
        return TypeInfo(kind='primitive', primitive_types={'string'})
    
    if isinstance(value, list):
        element_types: Set[str] = set()
        object_elements: List[Dict] = []
        
        for elem in value:
            if isinstance(elem, dict):
                object_elements.append(elem)
            else:
                elem_type = infer_type(elem, parent_key, interfaces, used_names)
                element_types.add(type_info_to_string(elem_type))
        
        # Handle object elements
        if object_elements:
            iface_name = allocate_interface_name(parent_key, used_names)
            merged_props: Dict[str, List[TypeInfo]] = {}
            
            for obj in object_elements:
                for key in obj:
                    if key not in merged_props:
                        merged_props[key] = []
                    merged_props[key].append(infer_type(obj[key], key, interfaces, used_names))
            
            final_props: Dict[str, InterfaceProperty] = {}
            for key, type_infos in merged_props.items():
                merged_type = merge_type_infos(type_infos)
                final_props[key] = InterfaceProperty(types=merged_type, is_optional=False)
            
            interfaces[iface_name] = InterfaceDefinition(name=iface_name, properties=final_props)
            element_types.add(iface_name)
        
        return TypeInfo(kind='array', array_element_types=element_types)
    
    if isinstance(value, dict):
        iface_name = allocate_interface_name(parent_key, used_names)
        props: Dict[str, List[TypeInfo]] = {}
        
        for key in value:
            if key not in props:
                props[key] = []
            props[key].append(infer_type(value[key], key, interfaces, used_names))
        
        final_props: Dict[str, InterfaceProperty] = {}
        for key, type_infos in props.items():
            merged_type = merge_type_infos(type_infos)
            final_props[key] = InterfaceProperty(types=merged_type, is_optional=False)
        
        interfaces[iface_name] = InterfaceDefinition(name=iface_name, properties=final_props)
        return TypeInfo(kind='object', object_name=iface_name)
    
    return TypeInfo(kind='primitive', primitive_types={'unknown'})


def merge_type_infos(type_infos: List[TypeInfo]) -> TypeInfo:
    """Merge multiple TypeInfos into a single TypeInfo."""
    all_types: Set[str] = set()
    
    for info in type_infos:
        if info.kind == 'primitive':
            for prim in info.primitive_types:
                all_types.add(prim)
        elif info.kind == 'array':
            for elem in info.array_element_types:
                all_types.add(elem + '[]')
        elif info.kind == 'object':
            all_types.add(info.object_name)
    
    # Sort by ASCII character codes
    sorted_types = sorted(all_types, key=compare_type_strings)
    
    if len(sorted_types) == 1:
        type_str = sorted_types[0]
        if type_str.endswith('[]'):
            return TypeInfo(kind='array', array_element_types={type_str[:-2]})
        elif type_str in ('null', 'string', 'number', 'boolean', 'unknown'):
            return TypeInfo(kind='primitive', primitive_types={type_str})
        else:
            return TypeInfo(kind='object', object_name=type_str)
    
    return TypeInfo(kind='union', primitive_types=set(sorted_types))


def type_info_to_string(info: TypeInfo) -> str:
    """Convert TypeInfo to its string representation (for intermediate use)."""
    if info.kind == 'primitive':
        sorted_prims = sorted(info.primitive_types, key=compare_type_strings)
        return sorted_prims[0] if sorted_prims else 'unknown'
    elif info.kind == 'array':
        sorted_elems = sorted(info.array_element_types, key=compare_type_strings)
        if len(sorted_elems) == 1:
            return sorted_elems[0]
        else:
            return '(' + ' | '.join(sorted_elems) + ')'
    elif info.kind == 'object':
        return info.object_name
    else:  # union
        sorted_types = sorted(info.primitive_types, key=compare_type_strings)
        return ' | '.join(sorted_types)


def format_type_string(info: TypeInfo) -> str:
    """Format TypeInfo as a type string for output in interface."""
    if info.kind == 'primitive':
        prims = list(info.primitive_types)
        if len(prims) == 1:
            return prims[0]
        else:
            sorted_prims = sorted(prims, key=compare_type_strings)
            return ' | '.join(sorted_prims)
    elif info.kind == 'array':
        sorted_elems = sorted(info.array_element_types, key=compare_type_strings)
        if len(sorted_elems) == 0:
            return 'unknown[]'
        elif len(sorted_elems) == 1:
            return sorted_elems[0] + '[]'
        else:
            return '(' + ' | '.join(sorted_elems) + ')[]'
    elif info.kind == 'object':
        return info.object_name
    else:  # union
        sorted_types = sorted(info.primitive_types, key=compare_type_strings)
        return ' | '.join(sorted_types)


def format_interface(iface: InterfaceDefinition) -> str:
    """Format an interface definition as TypeScript code."""
    if len(iface.properties) == 0:
        return f"export interface {iface.name} {{}}"
    
    lines = [f"export interface {iface.name} {{"]
    
    # Sort properties by ASCII order (case-sensitive)
    sorted_props = sorted(iface.properties.items(), key=lambda x: compare_type_strings(x[0]))
    
    for key, prop in sorted_props:
        optional = '?' if prop.is_optional else ''
        type_str = format_type_string(prop.types)
        lines.append(f"  {key}{optional}: {type_str};")
    
    lines.append("}")
    return '\n'.join(lines)


def solve(root_name: str, json_text: str) -> str:
    """Generate TypeScript type declarations from JSON data."""
    json_data = json.loads(json_text)
    
    interfaces: Dict[str, InterfaceDefinition] = {}
    used_names: Set[str] = {root_name}
    
    # Process all objects in the array
    merged_props: Dict[str, List[TypeInfo]] = {}
    prop_presence: Dict[str, int] = {}  # count of objects where key is present
    
    for obj in json_data:
        if isinstance(obj, dict):
            for key in obj:
                if key not in merged_props:
                    merged_props[key] = []
                    prop_presence[key] = 0
                merged_props[key].append(infer_type(obj[key], key, interfaces, used_names))
                prop_presence[key] += 1
    
    # Build root interface
    root_props: Dict[str, InterfaceProperty] = {}
    for key, type_infos in merged_props.items():
        merged_type = merge_type_infos(type_infos)
        is_optional = prop_presence[key] < len(json_data)
        root_props[key] = InterfaceProperty(types=merged_type, is_optional=is_optional)
    
    interfaces[root_name] = InterfaceDefinition(name=root_name, properties=root_props)
    
    # Output all interfaces in sorted order (ASCII)
    sorted_names = sorted(interfaces.keys(), key=compare_type_strings)
    output = []
    
    for name in sorted_names:
        iface = interfaces[name]
        output.append(format_interface(iface))
    
    return '\n\n'.join(output)


def main():
    lines = sys.stdin.read().split('\n')
    t = int(lines[0])

    blocks = []
    for i in range(t):
        root_name = lines[1 + 2 * i]
        json_text = lines[2 + 2 * i]
        blocks.append(solve(root_name, json_text))

    sys.stdout.write('\n---\n'.join(blocks) + '\n')


if __name__ == '__main__':
    main()
