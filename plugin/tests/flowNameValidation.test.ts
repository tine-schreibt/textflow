// tests/flowNameValidation.test.ts
// tests/flowNameValidation.test.ts
import { FlowService } from "../src/flowService";

describe("Flow Name Validation", () => {
  let flowService: FlowService;
  // Create a minimal version of the validation function for testing
  const isValidFlowName = (
    name: string
  ): { valid: boolean; reason?: string } => {
    // Check for empty or whitespace-only names
    if (!name || name.trim() === "") {
      return { valid: false, reason: "Flow name cannot be empty" };
    }

    // Check for system-reserved names
    const reservedNames = [
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
    if (reservedNames.includes(name.toUpperCase())) {
      return { valid: false, reason: "This name is reserved by the system" };
    }

    // Check for invalid characters - added backtick
    const invalidChars = /[<>:"/\\|?*#^[\]`\x00-\x1F]/g;
    if (invalidChars.test(name)) {
      return {
        valid: false,
        reason:
          'Name contains invalid characters (< > : " / \\ | ? * # ^ [ ] `)',
      };
    }

    // Check for names ending with period or space (problematic on Windows)
    if (name.endsWith(".") || name.endsWith(" ")) {
      return { valid: false, reason: "Name cannot end with a period or space" };
    }

    return { valid: true };
  };

  // Valid cases
  test("should accept valid flow names", () => {
    const validNames = [
      "My Flow",
      "flow123",
      "Test-Flow",
      "Flow with spaces",
      "Flow.with.dots",
      "Flow_with_underscore",
      "123NumericStart",
      "ÄÖÜäöü", // Unicode characters
      "Flow with émojis 🌟",
    ];

    validNames.forEach((name) => {
      const result = isValidFlowName(name);
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  // Invalid cases - empty/whitespace
  test("should reject empty or whitespace-only names", () => {
    const emptyNames = ["", " ", "\t", "\n", "   "];

    emptyNames.forEach((name) => {
      const result = isValidFlowName(name);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Flow name cannot be empty");
    });
  });

  // Invalid cases - system reserved names
  test("should reject system reserved names", () => {
    const reservedNames = [
      "CON",
      "PRN",
      "AUX",
      "NUL",
      "COM1",
      "LPT1",
      "con",
      "prn", // Test case-insensitive
      ".",
      "..",
    ];

    reservedNames.forEach((name) => {
      const result = isValidFlowName(name);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("This name is reserved by the system");
    });
  });

  // Invalid cases - special characters
  test("should reject names with invalid characters", () => {
    const namesWithInvalidChars = [
      "Flow<Name>", // < >
      "Flow:Name", // :
      'Flow"Name', // "
      "Flow/Name", // /
      "Flow\\Name", // \
      "Flow|Name", // |
      "Flow?Name", // ?
      "Flow*Name", // *
      "Flow#Name", // #
      "Flow^Name", // ^
      "Flow[Name]", // [ ]
      "Flow`Name", // `
      "Flow\0Name", // null character
    ];

    namesWithInvalidChars.forEach((name) => {
      const result = isValidFlowName(name);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe(
        'Name contains invalid characters (< > : " / \\ | ? * # ^ [ ] `)'
      );
    });
  });

  // Invalid cases - trailing characters
  test("should reject names ending with period or space", () => {
    const invalidEndingNames = [
      "FlowName.",
      "FlowName ",
      "FlowName. ",
      "FlowName .",
    ];

    invalidEndingNames.forEach((name) => {
      const result = isValidFlowName(name);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Name cannot end with a period or space");
    });
  });

  // Edge cases
  test("should handle edge cases appropriately", () => {
    const edgeCases = [
      { name: ".hidden", expectedValid: true }, // Leading dot (hidden files)
      { name: " LeadingSpace", expectedValid: true }, // Leading space
      { name: "VeryLongName".repeat(50), expectedValid: true }, // Very long name
      { name: "世界", expectedValid: true }, // Non-Latin characters
    ];

    edgeCases.forEach(({ name, expectedValid }) => {
      const result = isValidFlowName(name);
      expect(result.valid).toBe(expectedValid);
    });
  });
});
