console.log("Hello World! 🌍");

// Welcome to your fresh heap analyzer project!
// Ready to build something awesome? <3

export function greet(name: string = "World"): string {
  return `Hello, ${name}! <3`;
}

// If you want to run this directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(greet());
  console.log("Let's analyze some heaps! 🔍");
}
