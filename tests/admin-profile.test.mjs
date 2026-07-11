import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultAdminProfile,
  normalizeAdminProfile,
} from "../src/lib/admin-profile.ts";

test("owner profile defaults to Ryan and Mauritius", () => {
  const profile = defaultAdminProfile({
    displayName: "Admin",
    isOwner: true,
  });

  assert.equal(profile.displayName, "Ryan Chutooree");
  assert.equal(profile.headline, "Founder & Administrator");
  assert.equal(profile.location, "Mauritius");
});

test("profile normalization trims text and constrains photo positioning", () => {
  const fallback = defaultAdminProfile({
    displayName: "Admin User",
    isOwner: false,
  });
  const profile = normalizeAdminProfile(
    {
      displayName: "  Ryan   Chutooree  ",
      headline: "  Founder  ",
      location: " Mauritius ",
      bio: "  Building Mo T-Shirt.  ",
      avatarZoom: 8,
      avatarOffsetX: -90,
      avatarOffsetY: 60,
    },
    fallback
  );

  assert.equal(profile.displayName, "Ryan Chutooree");
  assert.equal(profile.headline, "Founder");
  assert.equal(profile.location, "Mauritius");
  assert.equal(profile.bio, "Building Mo T-Shirt.");
  assert.equal(profile.avatarZoom, 3);
  assert.equal(profile.avatarOffsetX, -35);
  assert.equal(profile.avatarOffsetY, 35);
});

test("optional profile details may be cleared while invalid images are discarded", () => {
  const fallback = defaultAdminProfile({
    displayName: "Admin User",
    isOwner: false,
  });
  const profile = normalizeAdminProfile(
    {
      displayName: "Admin User",
      headline: "",
      location: "",
      avatarDataUrl: "data:text/html;base64,PGgxPk5vPC9oMT4=",
    },
    fallback
  );

  assert.equal(profile.headline, "");
  assert.equal(profile.location, "");
  assert.equal(profile.avatarDataUrl, null);
});
