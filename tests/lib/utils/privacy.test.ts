import { describe, it, expect } from "vitest"
import { maskName, maskPaymentPayer } from "../../../lib/utils/privacy"

describe("maskName", () => {
  it("masks standard two-part name", () => {
    expect(maskName("John Smith")).toBe("J. Smith")
  })

  it("masks multi-part name to first initial + last name", () => {
    expect(maskName("Mary Jane Watson")).toBe("M. Watson")
  })

  it("returns single name unchanged", () => {
    expect(maskName("O'Connor")).toBe("O'Connor")
  })

  it("handles extra whitespace by trimming and normalizing", () => {
    expect(maskName("  John   Smith  ")).toBe("J. Smith")
  })

  it("returns empty string for empty input", () => {
    expect(maskName("")).toBe("")
  })

  it("capitalizes first initial from lowercase input", () => {
    expect(maskName("john smith")).toBe("J. smith")
  })

  it("preserves last name case from mixed case input", () => {
    expect(maskName("jOhN sMiTh")).toBe("J. sMiTh")
  })

  it("preserves hyphenated last name", () => {
    expect(maskName("John Smith-Jones")).toBe("J. Smith-Jones")
  })

  it("handles special characters in first name", () => {
    expect(maskName("Jean-Luc Picard")).toBe("J. Picard")
  })

  it("handles names with accented characters", () => {
    expect(maskName("José García")).toBe("J. García")
  })
})

describe("maskPaymentPayer", () => {
  it("delegates to maskName for standard names", () => {
    expect(maskPaymentPayer("Booker Name")).toBe("B. Name")
  })

  it("handles empty string", () => {
    expect(maskPaymentPayer("")).toBe("")
  })

  it("masks identically to maskName", () => {
    const testCases = [
      "John Smith",
      "Mary Jane Watson",
      "O'Connor",
      "  Alice   Cooper  ",
    ]
    for (const name of testCases) {
      expect(maskPaymentPayer(name)).toBe(maskName(name))
    }
  })
})
