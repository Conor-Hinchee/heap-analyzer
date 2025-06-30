import React from "react";
import { Text, Box, Newline, useInput } from "ink";

interface SnapshotGuideProps {
  onContinue: () => void;
  onSkip: () => void;
}

export const SnapshotGuide: React.FC<SnapshotGuideProps> = ({
  onContinue,
  onSkip,
}) => {
  const [currentPage, setCurrentPage] = React.useState(0);

  const pages = [
    {
      title: "� What This Tool Will Analyze",
      content: (
        <>
          <Text color="green" bold>
            Automatic Analysis Features:
          </Text>
          <Text>✓ Memory usage patterns and trends</Text>
          <Text>✓ Detached DOM node detection</Text>
          <Text>✓ Large object identification</Text>
          <Text>✓ Constructor breakdown analysis</Text>
          <Text>✓ Potential memory leak indicators</Text>
          <Newline />

          <Text color="cyan" bold>
            Comparison Capabilities:
          </Text>
          <Text>• Side-by-side snapshot comparison</Text>
          <Text>• Memory growth tracking</Text>
          <Text>• Object lifecycle analysis</Text>
          <Text>• Retention pattern detection</Text>
          <Newline />

          <Text color="magenta" bold>
            Actionable Recommendations:
          </Text>
          <Text>• Specific optimization suggestions</Text>
          <Text>• Code patterns to avoid</Text>
          <Text>• Performance improvement tips</Text>
          <Text>• Cleanup strategies</Text>
        </>
      ),
    },
    {
      title: "�📸 How to Take a Heap Snapshot",
      content: (
        <>
          <Text color="yellow" bold>
            Step 1: Open Chrome DevTools
          </Text>
          <Text>• Open your web application in Chrome</Text>
          <Text>• Press F12 or Ctrl+Shift+I (Cmd+Option+I on Mac)</Text>
          <Newline />

          <Text color="yellow" bold>
            Step 2: Navigate to Memory Tab
          </Text>
          <Text>• Click on the "Memory" tab in DevTools</Text>
          <Text>• Select "Heap snapshot" (should be selected by default)</Text>
          <Newline />

          <Text color="yellow" bold>
            Step 3: Take the Snapshot
          </Text>
          <Text>• Click "Take snapshot" button at the bottom</Text>
          <Text>
            • Wait for the snapshot to complete (may take a few seconds)
          </Text>
          <Newline />

          <Text color="yellow" bold>
            Step 4: Save the Snapshot
          </Text>
          <Text>• Right-click on the snapshot in the left panel</Text>
          <Text>• Select "Save as..." from the context menu</Text>
          <Text color="green">
            • Save the snapshot file to your ./snapshots directory
          </Text>
          <Text>
            • <Text color="magenta">before.heapsnapshot</Text> - Initial state
            or base state
          </Text>
          <Text>
            • <Text color="magenta">after.heapsnapshot</Text> - After some user
            interaction with a suspected memory leak
          </Text>
          <Newline />
        </>
      ),
    },
    {
      title: "💡 Memory Analysis Best Practices",
      content: (
        <>
          <Text color="yellow" bold>
            When to Take Snapshots:
          </Text>
          <Text>• Initial page load (baseline)</Text>
          <Text>• After user interactions (navigation, form submission)</Text>
          <Text>• During idle states (to check for leaks)</Text>
          <Text>• Before and after heavy operations</Text>
          <Newline />

          <Text color="red" bold>
            ⚠️ Common Memory Leak Patterns:
          </Text>
          <Text>• Detached DOM nodes</Text>
          <Text>• Event listeners not cleaned up</Text>
          <Text>• Closures holding references</Text>
          <Text>• Global variables accumulating data</Text>
        </>
      ),
    },
  ];

  useInput((input, key) => {
    if (key.rightArrow || input === "n" || input === "N") {
      if (currentPage < pages.length - 1) {
        setCurrentPage(currentPage + 1);
      }
    } else if (key.leftArrow || input === "p" || input === "P") {
      if (currentPage > 0) {
        setCurrentPage(currentPage - 1);
      }
    } else if (input === "c" || input === "C") {
      onContinue();
    } else if (input === "s" || input === "S") {
      onSkip();
    }
  });

  const currentPageData = pages[currentPage];

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color="cyan" bold>
          {currentPageData.title}
        </Text>
        <Text color="gray">
          Page {currentPage + 1} of {pages.length}
        </Text>
      </Box>

      <Box flexDirection="column" minHeight={20}>
        {currentPageData.content}
      </Box>

      <Newline />

      <Box
        flexDirection="column"
        borderStyle="single"
        borderTop={true}
        paddingTop={1}
      >
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row" gap={4}>
            {currentPage > 0 && <Text color="blue">[P] Previous</Text>}
            {currentPage < pages.length - 1 && (
              <Text color="blue">[N] Next</Text>
            )}
          </Box>
          <Box flexDirection="row" gap={4}>
            <Text color="green">[C] Continue to analysis</Text>
            <Text color="yellow">[S] Skip guide</Text>
          </Box>
        </Box>
        <Newline />
        <Text color="gray" italic>
          {currentPage < pages.length - 1
            ? "Use arrow keys or N/P to navigate • Press C to continue or S to skip"
            : "Press C to continue to analysis or S to skip"}
        </Text>
      </Box>
    </Box>
  );
};
