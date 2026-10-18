import {
  normalizeHttpMetricAttributes,
  normalizeJobMetricAttributes,
} from "@/lib/observability/metrics/attributes";

describe("metrics attributes", () => {
  it("keeps only bounded HTTP dimensions", () => {
    expect(
      normalizeHttpMetricAttributes({
        method: "get",
        outcome: "success",
        routePattern: "/api/resumes/[id]/history",
        statusCode: 201,
      }),
    ).toEqual({
      "event.outcome": "success",
      "http.request.method": "GET",
      "http.response.status_code_class": "2xx",
      "http.route": "/api/resumes/[id]/history",
    });
  });

  it("collapses unknown HTTP dimensions instead of exporting input", () => {
    expect(
      normalizeHttpMetricAttributes({
        method: "CUSTOM-user-secret",
        outcome: "unexpected",
        routePattern: "/public/private-user-slug",
        statusCode: 9999,
      }),
    ).toEqual({
      "event.outcome": "unknown",
      "http.request.method": "OTHER",
      "http.response.status_code_class": "unknown",
      "http.route": "/api/unknown",
    });
  });

  it("collapses unknown job attributes to a bounded vocabulary", () => {
    expect(
      normalizeJobMetricAttributes({
        jobType: "resume-id-123",
        outcome: "customer@example.com",
      }),
    ).toEqual({
      "event.outcome": "unknown",
      "job.type": "unknown",
    });
  });
});
