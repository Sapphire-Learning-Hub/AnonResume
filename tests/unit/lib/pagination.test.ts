import {
  parsePageRequest,
  readSearchParam,
  resolvePage,
} from "@/lib/pagination";

describe("pagination", () => {
  it("parses valid page parameters", () => {
    expect(parsePageRequest({ page: "2", pageSize: "50" })).toEqual({
      page: 2,
      pageSize: 50,
    });
  });

  it("normalizes invalid and excessive parameters", () => {
    expect(
      parsePageRequest({ page: ["bad", "4"], pageSize: "1000" }),
    ).toEqual({ page: 1, pageSize: 100 });
    expect(parsePageRequest({ page: "0", pageSize: "-2" })).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it("clamps requested pages to the available range", () => {
    expect(resolvePage(0, { page: 9, pageSize: 20 })).toEqual({
      page: 1,
      totalPages: 0,
      offset: 0,
    });
    expect(resolvePage(21, { page: 9, pageSize: 20 })).toEqual({
      page: 2,
      totalPages: 2,
      offset: 20,
    });
  });

  it("reads the first URL search parameter value", () => {
    expect(readSearchParam({ q: ["alice", "ignored"] }, "q")).toBe("alice");
    expect(readSearchParam({}, "q")).toBeUndefined();
  });
});
