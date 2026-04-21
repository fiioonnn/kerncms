import {
  Body,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface OTPEmailProps {
  otp: string;
  email: string;
}

export default function OTPEmail({ otp = "482910", email = "user@example.com" }: OTPEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your login code: {otp}</Preview>
      <Body style={body}>
        <Section style={wrapper}>
          <Img src="https://kerncms.com/logo-full.svg" alt="kerncms" height="32" style={{ marginBottom: "48px" }} />

          <Heading style={heading}>Your login code</Heading>

          <Text style={paragraph}>
            Enter this code to sign in as {email}.
          </Text>

          <Text style={code}>{otp}</Text>

          <Hr style={divider} />

          <Text style={footer}>
            This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.
          </Text>
        </Section>
      </Body>
    </Html>
  );
}

const body = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  background: "#1c1c1e",
  margin: "0",
  padding: "0",
};

const wrapper = {
  maxWidth: "460px",
  margin: "0 auto",
  padding: "60px 32px 48px",
};

const heading = {
  fontSize: "22px",
  fontWeight: "600" as const,
  color: "#fafafa",
  margin: "0 0 12px",
};

const paragraph = {
  fontSize: "15px",
  color: "#a1a1aa",
  margin: "0 0 32px",
  lineHeight: "1.6",
};

const code = {
  fontSize: "36px",
  fontWeight: "700" as const,
  fontFamily: "monospace",
  color: "#fafafa",
  letterSpacing: "8px",
  margin: "0 0 40px",
  lineHeight: "1",
};

const divider = {
  borderColor: "#262626",
  margin: "0 0 24px",
};

const footer = {
  fontSize: "13px",
  color: "#52525b",
  margin: "0",
  lineHeight: "1.6",
};
