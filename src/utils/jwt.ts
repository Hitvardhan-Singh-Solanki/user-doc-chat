import jwt, { SignOptions, Secret } from "jsonwebtoken";

const JWT_SECRET: Secret = process.env.JWT_SECRET || "supersecret";

export function signJwt(
  payload: object,
  expiresIn: string | number | undefined = process.env.JWT_EXPIRES_IN
) {
  const options: SignOptions = {};
  if (expiresIn !== undefined) {
    options.expiresIn = Number(expiresIn);
  } else {
    options.expiresIn = "15m";
  }

  options.algorithm = "HS256";

  return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyJwt<T extends object = jwt.JwtPayload>(token: string) {
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as T;
}
