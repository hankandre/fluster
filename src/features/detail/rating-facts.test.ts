import { describe, expect, it } from "vitest";
import { ratingFacts } from "./rating-facts";

describe("ratingFacts", () => {
  it("gives the community rating and then the critic rating", () => {
    expect(ratingFacts({ communityRating: 7.8, criticRating: 91 })).toEqual(["7.8 audience", "91% critics"]);
  });

  it("gives each rating alone", () => {
    expect(ratingFacts({ communityRating: 6.4 })).toEqual(["6.4 audience"]);
    expect(ratingFacts({ criticRating: 55 })).toEqual(["55% critics"]);
  });

  it("gives nothing without a rating", () => {
    expect(ratingFacts({})).toEqual([]);
  });

  it("rounds for reading", () => {
    expect(ratingFacts({ communityRating: 7.83 })).toEqual(["7.8 audience"]);
    expect(ratingFacts({ communityRating: 8 })).toEqual(["8.0 audience"]);
    expect(ratingFacts({ criticRating: 90.6 })).toEqual(["91% critics"]);
    expect(ratingFacts({ criticRating: 0 })).toEqual(["0% critics"]);
  });
});
