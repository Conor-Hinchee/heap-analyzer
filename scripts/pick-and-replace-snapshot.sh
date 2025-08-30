#!/bin/bash

# Interactive file picker for ~/Desktop/leaky ships
# Now handles before/after snapshot selection
dir="$HOME/Desktop/leaky ships"

# Use absolute path for snapshots_dir
snapshots_dir="$(cd "$(dirname "$0")/../snapshots" && pwd)"
before_file="$snapshots_dir/before.heapsnapshot"
after_file="$snapshots_dir/after.heapsnapshot"

# Ensure snapshots directory exists
mkdir -p "$snapshots_dir"

# List .heapsnapshot files and prompt for selection
cd "$dir" || { echo "Directory not found: $dir"; exit 1; }

files=( *.heapsnapshot )
if [ ${#files[@]} -eq 0 ]; then
  echo "No .heapsnapshot files found in $dir"
  exit 1
fi

echo "🔍 Heap Analyzer - Before/After Snapshot Setup"
echo "=============================================="
echo

# Select BEFORE snapshot
echo "📸 Step 1: Select the BEFORE snapshot (baseline memory state):"
select before_snapshot in "${files[@]}"; do
  if [[ -n "$before_snapshot" ]]; then
    echo "✅ Selected BEFORE: $before_snapshot"
    break
  else
    echo "Invalid selection. Try again."
  fi
done

echo

# Select AFTER snapshot (exclude the before snapshot from options)
echo "📸 Step 2: Select the AFTER snapshot (after triggering memory leak):"
remaining_files=()
for file in "${files[@]}"; do
  if [[ "$file" != "$before_snapshot" ]]; then
    remaining_files+=("$file")
  fi
done

if [ ${#remaining_files[@]} -eq 0 ]; then
  echo "❌ No other snapshots available. You need at least 2 snapshots for comparison."
  exit 1
fi

select after_snapshot in "${remaining_files[@]}"; do
  if [[ -n "$after_snapshot" ]]; then
    echo "✅ Selected AFTER: $after_snapshot"
    break
  else
    echo "Invalid selection. Try again."
  fi
done

echo
echo "📋 Summary:"
echo "  BEFORE: $before_snapshot → before.heapsnapshot"
echo "  AFTER:  $after_snapshot → after.heapsnapshot"
echo

# Copy files
echo "Copying BEFORE snapshot..."
cp -f "$before_snapshot" "$before_file"
echo "✅ Copied to: $before_file"

echo "Copying AFTER snapshot..."
cp -f "$after_snapshot" "$after_file"
echo "✅ Copied to: $after_file"

echo
echo "🎉 Setup complete! Ready to run heap analysis:"
echo "   cd $(dirname "$snapshots_dir")"
echo "   npm run dev"
