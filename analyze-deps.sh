#!/bin/bash
set -Eeuo pipefail
IFS=$'\n\t'

echo "=== Service Dependency Analysis ==="
echo ""

# Find all service files
mapfile -d '' -t services < <(find src/services -type f -name "*.service.ts" -not -name "*.spec.ts" -print0 | sort -z)

for service in "${services[@]}"; do
    echo "$(basename "$service"):"
    
    # Find service imports in this file
    service_imports="$(grep -nE '^[[:space:]]*import[[:space:]].*[[:space:]]from[[:space:]]+["'"'"'][^"'"'"']*\.service["'"'"']' -- "$service" 2>/dev/null || true)"
    
    if [ -n "$service_imports" ]; then
        printf '%s\n' "$service_imports" | while IFS= read -r line; do
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

    service_mod_esc="$(printf '%s' "$service_mod" | sed -E 's/[][^$.*/+?(){}|\\-]/\\&/g')"
    importers=()
    if ((${#services[@]})); then
      while IFS= read -r -d '' importer; do


        [[ "$importer" == "$service" ]] && continue
        importers+=("$importer")
      done < <(
        grep -Z -l -E "^[[:space:]]*import[[:space:]].*[[:space:]]from[[:space:]]+['\"][^'\"]*(${service_mod_esc}|${service_mod_esc}\.service)['\"]" -- "${services[@]}" 2>/dev/null || true
      )
    fi
    for importer in "${importers[@]}"; do
        importer_name="$(basename "$importer" .ts)"    # e.g. bar.service
        importer_mod="${importer_name%.service}"
        importer_mod_esc="$(printf '%s' "$importer_mod" | sed -E 's/[][^$.*/+?(){}|\\-]/\\&/g')"
        # Check if this service imports the importer back (reciprocal)
        if grep -q -E "^[[:space:]]*import[[:space:]].*[[:space:]]from[[:space:]]+['\"][^'\"]*(${importer_mod_esc}|${importer_mod_esc}\.service)['\"]" -- "$service" 2>/dev/null; then
            echo "  ⚠️  POTENTIAL CYCLE: $service_name ↔ $importer_name"
            # Show matching lines for clarity
            echo "    $service_name imports:"
            grep -nE "^[[:space:]]*import[[:space:]].*[[:space:]]from[[:space:]]+['\"][^'\"]*(${importer_mod_esc}|${importer_mod_esc}\.service)['\"]" -- "$service" || true
            echo "    $importer_name imports this service:"
            grep -nE "^[[:space:]]*import[[:space:]].*[[:space:]]from[[:space:]]+['\"][^'\"]*(${service_mod_esc}|${service_mod_esc}\.service)['\"]" -- "$importer" || true
        fi
    done
done
