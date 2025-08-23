import jwt, { SignOptions, JwtPayload } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN!;

export function signJwt(
  payload: JwtPayload,
  expiresIn: number = Number(JWT_EXPIRES_IN)
): string {
  const options: SignOptions = {
    expiresIn,
    algorithm: "HS256",
  };

  return jwt.sign(payload, JWT_SECRET, options);
}
