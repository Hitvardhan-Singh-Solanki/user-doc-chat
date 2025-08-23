
// -----------------------------------------------------------------------------
// Minimal self-contained test to ensure this file is a valid test suite if picked up.
// This does not assert constructor args (covered in minioRepo.client.spec.ts).
// Testing library/framework: Jest (ts-jest)
//
// If your project uses a different runner, this "describe/test" pair still follows
// common BDD style and should remain compatible.
// -----------------------------------------------------------------------------
describe("minioRepo module export", () => {
  it("exports a minioClient instance", () => {
    expect(minioClient).toBeDefined();
  });
});