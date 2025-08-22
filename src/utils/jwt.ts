import jwt, { SignOptions, Secret } from "jsonwebtoken";

const JWT_SECRET: Secret = process.env.JWT_SECRET || "supersecret";

export function signJwt(
  payload: object,
  expiresIn = process.env.JWT_EXPIRES_IN!
) {
  const options: SignOptions = { expiresIn: Number(expiresIn) };
  return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyJwt(token: string) {
  return jwt.verify(token, JWT_SECRET);
}
