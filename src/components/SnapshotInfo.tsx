import React from "react";
import { Text, Box, Newline, useInput } from "ink";
import { SnapshotFile } from "../types/index.js";
import { formatBytes } from "../utils/heapAnalyzer.js";

interface SnapshotInfoProps {
  snapshotFiles: SnapshotFile[];
  onBack: () => void;
}

export const SnapshotInfo: React.FC<SnapshotInfoProps> = ({
  snapshotFiles,
  onBack,
}) => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      onBack();
    } else if (key.upArrow && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    } else if (key.downArrow && selectedIndex < snapshotFiles.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  });

  const selectedFile = snapshotFiles[selectedIndex];

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          📊 Snapshot Information
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color="gray">
          Found {snapshotFiles.length} snapshot file
          {snapshotFiles.length !== 1 ? "s" : ""}
        </Text>
        <Text color="gray">Use ↑/↓ to navigate, ESC or 'q' to go back</Text>
      </Box>

      <Box flexDirection="row" marginBottom={1}>
        {/* File list */}
        <Box flexDirection="column" width="50%" marginRight={2}>
          <Text color="yellow" bold>
            📁 Files:
          </Text>
          {snapshotFiles.map((file, index) => (
            <Box key={file.name} marginLeft={1}>
              <Text color={index === selectedIndex ? "green" : "white"}>
                {index === selectedIndex ? "▶ " : "  "}
                {file.name}
              </Text>
            </Box>
          ))}
        </Box>

        {/* File details */}
        <Box flexDirection="column" width="50%">
          <Text color="yellow" bold>
            📋 Details:
          </Text>
          {selectedFile && (
            <Box flexDirection="column" marginLeft={1}>
              <Text>
                <Text color="cyan">Name:</Text> {selectedFile.name}
              </Text>
              <Text>
                <Text color="cyan">Size:</Text> {formatBytes(selectedFile.size)}
              </Text>
              <Text>
                <Text color="cyan">Created:</Text>{" "}
                {selectedFile.created.toLocaleString()}
              </Text>
              <Text>
                <Text color="cyan">Path:</Text> {selectedFile.path}
              </Text>

              <Newline />
              <Text color="gray">💡 Snapshot Type:</Text>
              <Box marginLeft={1}>
                <Text>{getSnapshotType(selectedFile.name)}</Text>
              </Box>

              <Newline />
              <Text color="gray">🎯 Recommended Use:</Text>
              <Box marginLeft={1}>
                <Text>{getRecommendedUse(selectedFile.name)}</Text>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <Box borderStyle="single" borderColor="gray" padding={1} marginTop={1}>
        <Text color="magenta">
          💡 Memory Leak Detection:
          <Newline />
          • This tool requires TWO snapshots: before.heapsnapshot and
          after.heapsnapshot
          <Newline />
          • Take 'before' snapshot at your app's stable state
          <Newline />
          • Perform leak-prone actions (navigation, modals, etc.)
          <Newline />
          • Take 'after' snapshot to compare memory growth
          <Newline />• The tool will identify objects that should have been
          cleaned up
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">
          Press <Text color="yellow">ESC</Text> or <Text color="yellow">q</Text>{" "}
          to go back
        </Text>
      </Box>
    </Box>
  );
};

function getSnapshotType(filename: string): string {
  if (filename === "before.heapsnapshot") {
    return "⏮️ Before State - Initial memory state for comparison";
  } else if (filename === "after.heapsnapshot") {
    return "⏭️ After State - Memory state after operations for comparison";
  } else if (filename.includes("before")) {
    return "⏮️ Before State - Initial memory state";
  } else if (filename.includes("after")) {
    return "⏭️ After State - Memory state after operations";
  } else {
    return "📊 Custom Snapshot - May not work with this tool's comparison logic";
  }
}

function getRecommendedUse(filename: string): string {
  if (filename === "before.heapsnapshot") {
    return "✅ Required: Use with after.heapsnapshot for memory leak detection";
  } else if (filename === "after.heapsnapshot") {
    return "✅ Required: Use with before.heapsnapshot to identify memory growth";
  } else if (filename.includes("before")) {
    return "Baseline snapshot for memory comparison analysis";
  } else if (filename.includes("after")) {
    return "Changed state snapshot for memory comparison analysis";
  } else {
    return "⚠️  This tool requires before.heapsnapshot and after.heapsnapshot specifically";
  }
}
