import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: () => {},
    get: () => undefined,
    delete: () => {},
  }),
}));

const { signup, login } = await import("@/server/auth");

describe("auth", () => {
  const email = "testuser@demo.test";
  const password = "pass1234";

  it("signup then login works", async () => {
    const created = await signup({ email, name: "Test User", password, role: "student" });
    expect("user" in created).toBe(true);
    if ("user" in created) {
      expect(created.user.email).toBe(email);
      expect(created.user.role).toBe("student");
    }

    const loggedIn = await login({ email, password });
    expect("user" in loggedIn).toBe(true);
  });

  it("wrong password is rejected", async () => {
    const result = await login({ email, password: "not-the-password" });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toBe("invalid_credentials");
  });

  it("duplicate email is rejected", async () => {
    const result = await signup({
      email,
      name: "Different Person",
      password: "another1",
      role: "student",
    });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toBe("email_taken");
  });
});
