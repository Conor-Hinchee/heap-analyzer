import React from "react";
import { Text, Box, Newline } from "ink";

const asciiArt = `
    ██╗  ██╗███████╗ █████╗ ██████╗ 
    ██║  ██║██╔════╝██╔══██╗██╔══██╗
    ███████║█████╗  ███████║██████╔╝
    ██╔══██║██╔══╝  ██╔══██║██╔═══╝ 
    ██║  ██║███████╗██║  ██║██║     
    ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     
                                    
     █████╗ ███╗   ██╗ █████╗ ██╗   ██╗   ██╗███████╗███████╗██████╗ 
    ██╔══██╗████╗  ██║██╔══██╗██║   ╚██╗ ██╔╝╚══███╔╝██╔════╝██╔══██╗
    ███████║██╔██╗ ██║███████║██║    ╚████╔╝   ███╔╝ █████╗  ██████╔╝
    ██╔══██║██║╚██╗██║██╔══██║██║     ╚██╔╝   ███╔╝  ██╔══╝  ██╔══██╗
    ██║  ██║██║ ╚████║██║  ██║███████╗ ██║   ███████╗███████╗██║  ██║
    ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝ ╚═╝   ╚══════╝╚══════╝╚═╝  ╚═╝
`;

interface WelcomeProps {
  onNext: () => void;
}

export const Welcome: React.FC<WelcomeProps> = ({ onNext }) => {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onNext();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onNext]);

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      paddingX={2}
      paddingY={1}
    >
      <Text color="cyan" bold>
        {asciiArt}
      </Text>
      <Newline />
      <Text color="green" bold>
        🚀 Welcome to Heap Analyzer
      </Text>
      <Newline />
      <Box flexDirection="column" alignItems="center" width={80}>
        <Text color="yellow">
          A CLI tool for analyzing JavaScript heap snapshots from Google
          DevTools.
        </Text>
        <Text color="yellow">
          Helps developers trace memory issues, browser crashes, and provides
        </Text>
        <Text color="yellow">
          actionable insights for fixing leaks in JavaScript applications.
        </Text>
      </Box>
      <Newline />
      <Text color="magenta" italic>
        💡 Cut through the clutter and get down to actionable memory fixes
      </Text>
      <Newline />
      <Text color="gray">Initializing... Please wait</Text>
    </Box>
  );
};
