/**
 * Semantic-release configuration mirroring other actual-* services.
 * Skips npm publish (Docker/GitHub releases only) and commits changelog updates.
 */
module.exports = {
  branches: ["main"],
  repositoryUrl:
    process.env.REPOSITORY_URL ||
    "https://github.com/rjlee/actual-sync-google-sheets.git",
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md" }],
    ["@semantic-release/npm", { npmPublish: false }],
    [
      "@semantic-release/git",
      {
        assets: ["CHANGELOG.md", "package.json", "package-lock.json"],
        message:
          "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
    "@semantic-release/github",
  ],
};
