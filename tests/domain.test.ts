import { describe, expect, it } from "vitest";
import {
  domainKey,
  hostnameFromUrl,
  registrableDomainFromHostname,
  stripWww,
} from "../src/util/domain";

describe("hostnameFromUrl", () => {
  it("lowercases the hostname", () => {
    expect(hostnameFromUrl("https://Docs.GitHub.com/")).toBe("docs.github.com");
  });

  it("returns undefined for invalid input", () => {
    expect(hostnameFromUrl("")).toBeUndefined();
    expect(hostnameFromUrl(undefined)).toBeUndefined();
    expect(hostnameFromUrl("not a url")).toBeUndefined();
  });

  it("returns undefined for schemes with no host", () => {
    // empty host is coerced to undefined by hostnameFromUrl
    expect(hostnameFromUrl("file:///tmp/x")).toBeUndefined();
  });
});

describe("stripWww", () => {
  it("strips a single leading www.", () => {
    expect(stripWww("www.example.com")).toBe("example.com");
    expect(stripWww("example.com")).toBe("example.com");
    expect(stripWww("www.www.example.com")).toBe("www.example.com");
  });
});

describe("registrableDomainFromHostname", () => {
  it("returns the last two labels by default", () => {
    expect(registrableDomainFromHostname("docs.github.com")).toBe("github.com");
    expect(registrableDomainFromHostname("a.b.c.example.com")).toBe("example.com");
  });

  it("handles known multi-part suffixes", () => {
    expect(registrableDomainFromHostname("news.bbc.co.uk")).toBe("bbc.co.uk");
    expect(registrableDomainFromHostname("foo.com.au")).toBe("foo.com.au");
  });

  it("passes through two-label hosts", () => {
    expect(registrableDomainFromHostname("example.com")).toBe("example.com");
  });
});

describe("domainKey", () => {
  it("uses hostname mode when requested", () => {
    expect(domainKey("docs.github.com", "hostname", false)).toBe(
      "docs.github.com"
    );
  });

  it("reduces to registrable domain by default", () => {
    expect(domainKey("docs.github.com", "registrableDomain", false)).toBe(
      "github.com"
    );
  });

  it("respects stripWww for hostname mode", () => {
    expect(domainKey("www.github.com", "hostname", true)).toBe("github.com");
    expect(domainKey("www.github.com", "hostname", false)).toBe(
      "www.github.com"
    );
  });

  it("reduces www.* to registrable domain regardless of stripWww", () => {
    // registrable-domain reduction already drops subdomains like www.
    expect(domainKey("www.github.com", "registrableDomain", false)).toBe(
      "github.com"
    );
  });

  it("returns undefined for empty hostname", () => {
    expect(domainKey(undefined, "hostname", false)).toBeUndefined();
  });
});
