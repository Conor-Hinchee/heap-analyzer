import React from "react";
import { Text, Box, Newline, useInput } from "ink";

interface WelcomeProps {
  onNext: () => void;
}

export const Welcome: React.FC<WelcomeProps> = ({ onNext }) => {
  useInput(() => {
    onNext();
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="cyan" bold>
        🚀 Heap Analyzer
      </Text>
      <Text color="gray">Memory Leak Detection & Analysis</Text>
      <Newline />

      <Text color="green">Press any key to start analysis...</Text>
    </Box>
  );
};
