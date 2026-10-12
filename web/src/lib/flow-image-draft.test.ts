import { describe, expect, it } from "vitest";
import { imageDraftProject, parseImageDraft } from "./flow-image-draft";

describe("local image draft parser", () => {
  it("keeps explicit names, Unicode prompts, order and pipes within prompts", () => {
    const result = parseImageDraft("\n001_sahil | Gün batımı | gerçekçi\r\n002_orman | 森林\n");
    expect(result.issues).toEqual([]);
    expect(result.items).toEqual([{ name: "001_sahil", prompt: "Gün batımı | gerçekçi" }, { name: "002_orman", prompt: "森林" }]);
    expect(result.batches).toEqual([result.items]);
  });
  it("splits 100 prompts into exactly ten planned groups without extra outputs", () => {
    const result = parseImageDraft(Array.from({ length: 100 }, (_, i) => `img_${i} | Prompt ${i}`).join("\n"));
    expect(result.items).toHaveLength(100);
    expect(result.batches).toHaveLength(10);
    expect(result.batches.every((b) => b.length === 10)).toBe(true);
    expect(result.batches.flat()).toEqual(result.items);
  });
  it("never silently truncates beyond 100", () => {
    const result = parseImageDraft(Array.from({ length: 101 }, (_, i) => `img_${i} | prompt`).join("\n"));
    expect(result.issues).toContainEqual({ line: 101, code: "limit" });
    expect(result.batches).toEqual([]);
  });
  it.each(["../img", "img.jpg", "CON", "aux", "lpt9", "bad/name", "bad\\name", "bad:name", "x".repeat(81)])("rejects unsafe file stem %s", (name) => {
    const result = parseImageDraft(`${name} | prompt`);
    expect(result.issues[0].code).toBe("name");
    expect(result.batches).toEqual([]);
  });
  it("rejects case-insensitive collisions and incomplete lines with actual line numbers", () => {
    const result = parseImageDraft("\nimg | prompt\nIMG | different\nno separator\nempty | ");
    expect(result.issues).toEqual([{ line: 3, code: "duplicate" }, { line: 4, code: "format" }, { line: 5, code: "prompt" }]);
    expect(result.batches).toEqual([]);
  });
  it("bounds input and individual prompts", () => {
    expect(parseImageDraft("a".repeat(200_001)).issues[0].code).toBe("size");
    expect(parseImageDraft(`img | ${"a".repeat(8001)}`).issues[0].code).toBe("prompt");
    expect(parseImageDraft(" \n").items).toEqual([]);
  });
  it("allows only exact Flow project URLs, not queries, credentials or lookalikes", () => {
    const url = "https://flow.google.com/project/11111111-2222-3333-4444-555555555555";
    expect(imageDraftProject(url + "/")).toBe(url);
    expect(imageDraftProject(url + "/collection/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe(url);
    for (const value of [url + "?secret=x", url + "/other", url.replace("https:", "http:"), url.replace("flow.google.com", "flow.google.com.evil.invalid"), "https://flow.google.com", "javascript:alert(1)"]) expect(imageDraftProject(value)).toBeNull();
  });
});
