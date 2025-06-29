import React from "react";
import { Text, Box, Newline, useInput } from "ink";

interface DirectoryCheckProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export const DirectoryCheck: React.FC<DirectoryCheckProps> = ({
  onConfirm,
  onCancel,
}) => {
  useInput((input) => {
    if (input === "y" || input === "Y") {
      onConfirm();
    } else if (input === "n" || input === "N") {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="yellow" bold>
        📁 Snapshot Directory Setup
      </Text>
      <Newline />
      <Text>No "snapshots" directory found in the current directory.</Text>
      <Text>
        This directory will store your heap snapshot files (.heapsnapshot).
      </Text>
      <Newline />
      <Text color="green">
        ✅ Would you like me to create a "snapshots" directory here?
      </Text>
      <Newline />
      <Box flexDirection="row" gap={2}>
        <Text color="green">[Y] Yes, create directory</Text>
        <Text color="red">[N] No, exit</Text>
      </Box>
      <Newline />
      <Text color="gray" italic>
        Press Y to confirm or N to cancel...
      </Text>
    </Box>
  );
};
