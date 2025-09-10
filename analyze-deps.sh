#!/bin/bash

echo "=== Service Dependency Analysis ==="
echo ""

# Find all service files
services=($(find src/services -name "*.service.ts" -not -name "*.spec.ts" | sort))

for service in "${services[@]}"; do
    echo "$(basename $service):"
    
    # Find service imports in this file
    service_imports=$(grep -n "import.*Service.*from.*service" "$service" 2>/dev/null || true)
    
    if [ -n "$service_imports" ]; then
        echo "$service_imports" | while read -r line; do
            echo "  └─ $line"
        done
    else
        echo "  └─ No service imports"
    fi
    echo ""
done

echo "=== Checking for potential cycles ==="
echo ""

# Check each service file for imports that might create cycles
for service in "${services[@]}"; do
    service_name="$(basename "$service" .ts)"         # e.g. foo.service
    service_mod="${service_name%.service}"            # e.g. foo
    printf "Checking %s for cycles...\n" "$service_name"

    # Find importers that import this service by module path ('from "./foo"' or './foo.service')
    importers=()
    while IFS= read -r -d '' importer; do
        # Skip self
        [[ "$importer" == "$service" ]] && continue
        importers+=("$importer")
    done < <(
        grep -Z -l -E "^[[:space:]]*import[[:space:]].*\bfrom[[:space:]]+['\"][^'\"]*(${service_mod}|${service_mod}\.service)['\"]" -- "${services[@]}" 2>/dev/null || true
    )

    for importer in "${importers[@]}"; do
        importer_name="$(basename "$importer" .ts)"    # e.g. bar.service
        importer_mod="${importer_name%.service}"
        # Check if this service imports the importer back (reciprocal)
        if grep -q -E "^[[:space:]]*import[[:space:]].*\bfrom[[:space:]]+['\"][^'\"]*(${importer_mod}|${importer_mod}\.service)['\"]" -- "$service" 2>/dev/null; then
            echo "  ⚠️  POTENTIAL CYCLE: $service_name ↔ $importer_name"
            # Show matching lines for clarity
            echo "    $service_name imports:"
            grep -nE "^[[:space:]]*import[[:space:]].*\bfrom[[:space:]]+['\"][^'\"]*(${importer_mod}|${importer_mod}\.service)['\"]" -- "$service" || true
            echo "    $importer_name imports this service:"
            grep -nE "^[[:space:]]*import[[:space:]].*\bfrom[[:space:]]+['\"][^'\"]*(${service_mod}|${service_mod}\.service)['\"]" -- "$importer" || true
        fi
    done
done
