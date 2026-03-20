export function formatExampleMessage(name?: string): string {
  const trimmedName = name?.trim();

  if (trimmedName) {
    return `Hello, ${trimmedName}.`;
  }

  return "Hello, world.";
}
