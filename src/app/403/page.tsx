export default function Forbidden() {
  return (
    <div className="p-10 text-center">
      <h1 className="text-2xl font-semibold mb-2">You don’t have access</h1>
      <p className="text-gray-600">Ask an org admin to invite you.</p>
    </div>
  );
}
