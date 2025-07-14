// test-flow-names.ts
// test-flow-names.ts
const invalidChars = /[<>:"/\\|?*#^[\]`\x00-\x1F]/;
// Let's test each character separately
const individualCharTests = [
    { name: ":", expected: false },
    { name: "#", expected: false },
    { name: "`", expected: false }
];

console.log("Testing individual characters:");
individualCharTests.forEach(({name, expected}) => {
    const hasInvalidChar = invalidChars.test(name);
    console.log(
        `Character "${name}": ${hasInvalidChar ? "caught" : "NOT caught"} by regex`
    );
    // Let's also see the actual regex match result
    console.log(`  Match result:`, name.match(invalidChars));
});

// Let's also try a different regex pattern
const altRegex = /[:#{}`]/g;
console.log("\nTrying alternative regex:");
individualCharTests.forEach(({name}) => {
    console.log(
        `Character "${name}": ${altRegex.test(name) ? "caught" : "NOT caught"} by alternative regex`
    );
});const reservedNames = [
  ".",
  "..",
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
];

function isValidFlowName(name: string): { valid: boolean; reason?: string } {
  // Check for empty or whitespace-only names
  if (!name || name.trim() === "") {
    return { valid: false, reason: "Flow name cannot be empty" };
  }

  // Check for system-reserved names
  if (reservedNames.includes(name.toUpperCase())) {
    return { valid: false, reason: "This name is reserved by the system" };
  }

  // Check for invalid characters
  if (invalidChars.test(name)) {
    return {
      valid: false,
      reason: 'Name contains invalid characters (< > : " / \\ | ? * # ^ [ ] `)',
    };
  }

  // Check for names ending with period or space
  if (name.endsWith(".") || name.endsWith(" ")) {
    return { valid: false, reason: "Name cannot end with a period or space" };
  }

  return { valid: true };
}

const testNames = [
  // Should be valid
  { name: "My Flow", expected: true },
  { name: "flow123", expected: true },
  { name: "Test-Flow", expected: true },
  { name: "Flow with spaces", expected: true },
  { name: "ÄÖÜäöü", expected: true },

  // Should be invalid
  { name: "Flow<Name>", expected: false },
  { name: "Flow:Name", expected: false },
  { name: 'Flow"Name', expected: false },
  { name: "Flow#Tag", expected: false },
  { name: "Flow[bracket]", expected: false },
  { name: "Flow`backtick", expected: false },
  { name: "", expected: false },
  { name: "CON", expected: false },
  { name: "com1", expected: false }, // test case-insensitive
  { name: "LPT1", expected: false },
  { name: "Flow.", expected: false },
  { name: ".", expected: false },
  { name: "..", expected: false },
];

testNames.forEach(({ name, expected }) => {
  const result = isValidFlowName(name);
  const passed = result.valid === expected;
  console.log(
    `"${name}": ${passed ? "✓" : "✗"} (got ${
      result.valid
    }, expected ${expected})${!passed ? ` - ${result.reason}` : ""}`
  );
});
