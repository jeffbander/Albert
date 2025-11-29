export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center p-8">
        <h1 className="text-4xl font-bold text-indigo-900 mb-4">
          CareSync AI
        </h1>
        <p className="text-xl text-indigo-700 mb-8">
          Medical AI Patient Assistant
        </p>
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-md mx-auto">
          <p className="text-gray-600 mb-4">
            AI-powered health companions for your patients, communicating via WhatsApp.
          </p>
          <div className="text-sm text-gray-500 space-y-2">
            <p>✓ Personalized AI for each patient</p>
            <p>✓ Medical knowledge & clinical reasoning</p>
            <p>✓ Automatic alerts for care team</p>
            <p>✓ HIPAA-ready audit logging</p>
          </div>
        </div>
        <p className="mt-8 text-sm text-indigo-600">
          API endpoints ready at /api/patients and /api/whatsapp/webhook
        </p>
      </div>
    </main>
  )
}
