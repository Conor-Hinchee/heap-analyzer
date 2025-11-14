// Simple test to verify Jest is working
describe('Jest Setup', () => {
  it('should work', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle basic math', () => {
    expect(Math.max(1, 2, 3)).toBe(3);
  });
});