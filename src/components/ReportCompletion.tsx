import React from "react";
import { Text, Box, Newline, useInput } from "ink";

interface ReportCompletionProps {
  snapshotName: string;
  reportPath: string;
  onBackToMenu: () => void;
}

export const ReportCompletion: React.FC<ReportCompletionProps> = ({
  snapshotName,
  reportPath,
  onBackToMenu,
}) => {
  useInput((input, key) => {
    // Any key press returns to main menu
    onBackToMenu();
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="green" bold>
        ✅ Markdown Report Generated Successfully!
      </Text>
      <Newline />

      <Box flexDirection="column" marginY={1}>
        <Text color="cyan">
          📊 Analyzed: <Text color="yellow">{snapshotName}</Text>
        </Text>
        <Text color="green">
          📝 Report saved to: <Text color="white">{reportPath}</Text>
        </Text>
      </Box>

      <Newline />

      <Box flexDirection="column" marginY={1}>
        <Text color="blue" bold>
          📋 Report Contents:
        </Text>
        <Text color="gray">• Executive summary with severity assessment</Text>
        <Text color="gray">• Leak detection analysis</Text>
        <Text color="gray">• Framework detection results</Text>
        <Text color="gray">• Top memory consumers table</Text>
        <Text color="gray">• Actionable recommendations</Text>
        <Text color="gray">• Technical details and metrics</Text>
      </Box>

      <Newline />

      <Box flexDirection="column">
        <Text color="yellow" bold>
          💡 What's Next:
        </Text>
        <Text color="gray">• Share the report with your team</Text>
        <Text color="gray">• Attach to GitHub issues or tickets</Text>
        <Text color="gray">• Use in documentation or presentations</Text>
        <Text color="gray">• Compare with future snapshots</Text>
      </Box>

      <Newline />

      <Box
        flexDirection="column"
        borderStyle="single"
        borderTop={true}
        paddingTop={1}
      >
        <Text color="cyan" bold>
          Press any key to return to main menu
        </Text>
      </Box>
    </Box>
  );
};
