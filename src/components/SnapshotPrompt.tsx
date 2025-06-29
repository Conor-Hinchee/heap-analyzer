import React from "react";
import { Text, Box, Newline, useInput } from "ink";
import { MenuOption } from "../types/index.js";

interface SnapshotPromptProps {
  snapshotCount: number;
  onAnalyze: () => void;
  onView: () => void;
  onExit: () => void;
}

export const SnapshotPrompt: React.FC<SnapshotPromptProps> = ({
  snapshotCount,
  onAnalyze,
  onView,
  onExit,
}) => {
  useInput((input) => {
    switch (input) {
      case "1":
        onAnalyze();
        break;
      case "2":
        onView();
        break;
      case "3":
      case "q":
        onExit();
        break;
    }
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="green" bold>
        📊 Heap Analyzer - Main Menu
      </Text>
      <Newline />
      <Text>
        Found {snapshotCount} snapshot file(s) in ./snapshots directory
      </Text>
      <Newline />
      <Text color="cyan" bold>
        What would you like to do?
      </Text>
      <Newline />
      <Text color="green">[1] Analyze snapshots for memory leaks</Text>
      <Text color="yellow">[2] View snapshot information</Text>
      <Text color="red">[3] Exit (or press 'q')</Text>
      <Newline />
      <Text color="gray" italic>
        Press a number to select an option...
      </Text>
    </Box>
  );
};
