#!/usr/bin/env python3
"""
JSON to TypeScript Type Generator
Converts JSON arrays to TypeScript interface declarations
"""

import sys
import json
from typing import Any, Dict, Set, List, Optional
from dataclasses import dataclass, field


@dataclass
class TypeInfo:
    """Represents a TypeScript type"""
    kind: str  # 'primitive', 'array', 'object', 'union'
    value: Optional[str] = None  # For single primitive/object types
    union_parts: Set[str] = field(default_factory=set)  # For unions


@dataclass
class InterfaceProperty:
    """A property in an interface"""
    type_str: str
    is_optional: bool


@dataclass
class InterfaceDefinition:
    """A TypeScript interface"""
    name: str
    properties: Dict[str, InterfaceProperty] = field(default_factory=dict)


def char_code_key(s: str) -> tuple:
    """Convert string to tuple of char codes for ASCII sorting"""
    return tuple(ord(c) for c in s)


def allocate_name(base: str, used: Set[str]) -> str:
    """Allocate a unique interface name"""
    name = base[0].upper() + base[1:] if base else "Unknown"
    
    if name not in used:
        used.add(name)
        return name
    
    counter = 2
    while f"{name}{counter}" in used:
        counter += 1
    
    result = f"{name}{counter}"
    used.add(result)
    return result


def infer_type_from_value(
    value: Any,
    key: str,
    interfaces: Dict[str, InterfaceDefinition],
    used_names: Set[str]
) -> str:
    """Infer type string from a single JSON value"""
    
    if value is None:
        return "null"
    
    if isinstance(value, bool):
        return "boolean"
    
    if isinstance(value, (int, float)):
        return "number"
    
    if isinstance(value, str):
        return "string"
    
    if isinstance(value, list):
        if not value:
            return "unknown[]"
        
        elem_types: Set[str] = set()
        obj_elements: List[Dict] = []
        
        for elem in value:
            if isinstance(elem, dict):
                obj_elements.append(elem)
            else:
                elem_types.add(infer_type_from_value(elem, key, interfaces, used_names))
        
        if obj_elements:
            # Merge all object elements into one interface
            merged_props: Dict[str, List[str]] = {}
            for obj in obj_elements:
                for k in obj:
                    if k not in merged_props:
                        merged_props[k] = []
                    merged_props[k].append(infer_type_from_value(obj[k], k, interfaces, used_names))
            
            # Create interface
            iface_name = allocate_name(key, used_names)
            iface_props: Dict[str, InterfaceProperty] = {}
            for k, types in merged_props.items():
                union_type = sort_and_union(set(types))
                iface_props[k] = InterfaceProperty(union_type, False)
            
            interfaces[iface_name] = InterfaceDefinition(iface_name, iface_props)
            elem_types.add(iface_name)
        
        elem_str = sort_and_union(elem_types)
        if elem_str == "unknown":
            return "unknown[]"
        elif " | " in elem_str:
            return f"({elem_str})[]"
        else:
            return f"{elem_str}[]"
    
    if isinstance(value, dict):
        iface_name = allocate_name(key, used_names)
        iface_props: Dict[str, InterfaceProperty] = {}
        
        for k in value:
            type_str = infer_type_from_value(value[k], k, interfaces, used_names)
            iface_props[k] = InterfaceProperty(type_str, False)
        
        interfaces[iface_name] = InterfaceDefinition(iface_name, iface_props)
        return iface_name
    
    return "unknown"


def sort_and_union(types: Set[str]) -> str:
    """Sort types by ASCII and join with |"""
    if not types:
        return "unknown"
    
    sorted_types = sorted(types, key=char_code_key)
    
    if len(sorted_types) == 1:
        return sorted_types[0]
    
    return " | ".join(sorted_types)


def solve(root_name: str, json_text: str) -> str:
    """Generate TypeScript declarations for a single test case"""
    
    json_array = json.loads(json_text)
    interfaces: Dict[str, InterfaceDefinition] = {}
    used_names: Set[str] = {root_name}
    
    # Collect all properties from all objects
    all_props: Dict[str, List[str]] = {}
    prop_count: Dict[str, int] = {}
    
    for obj in json_array:
        if not isinstance(obj, dict):
            continue
        
        for key in obj:
            if key not in all_props:
                all_props[key] = []
                prop_count[key] = 0
            
            type_str = infer_type_from_value(obj[key], key, interfaces, used_names)
            all_props[key].append(type_str)
            prop_count[key] += 1
    
    # Build root interface
    root_props: Dict[str, InterfaceProperty] = {}
    for key, types in all_props.items():
        union_type = sort_and_union(set(types))
        is_optional = prop_count[key] < len(json_array)
        root_props[key] = InterfaceProperty(union_type, is_optional)
    
    interfaces[root_name] = InterfaceDefinition(root_name, root_props)
    
    # Format output
    sorted_names = sorted(interfaces.keys(), key=char_code_key)
    output_lines = []
    
    for name in sorted_names:
        iface = interfaces[name]
        output_lines.append(format_interface(iface))
    
    return "\n\n".join(output_lines)


def format_interface(iface: InterfaceDefinition) -> str:
    """Format an interface as TypeScript code"""
    
    if not iface.properties:
        return f"export interface {iface.name} {{}}"
    
    lines = [f"export interface {iface.name} {{"]
    
    # Sort properties by ASCII
    sorted_props = sorted(iface.properties.items(), key=lambda x: char_code_key(x[0]))
    
    for key, prop in sorted_props:
        optional = "?" if prop.is_optional else ""
        lines.append(f"  {key}{optional}: {prop.type_str};")
    
    lines.append("}")
    return "\n".join(lines)


def main():
    """Main entry point"""
    lines = sys.stdin.read().split('\n')
    t = int(lines[0].strip())
    
    results = []
    idx = 1
    
    for _ in range(t):
        root_name = lines[idx].strip()
        json_text = lines[idx + 1].strip()
        idx += 2
        
        result = solve(root_name, json_text)
        results.append(result)
    
    sys.stdout.write("\n---\n".join(results) + "\n")


if __name__ == "__main__":
    main()
