/** @derives(ADR-0002) */
const API_URL = process.env.NEXT_PUBLIC_AXHY_API_URL!;

export default function Login() {
  async function send() {
    await fetch('/api/health');
    await fetch(`${API_URL}/auth/otp/request`, { method: 'POST' });
  }
  return <button onClick={send}>Send</button>;
}
