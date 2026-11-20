interface CheckoutStepsProps {
  currentStep: number;
}

export default function CheckoutSteps({ currentStep }: CheckoutStepsProps) {
  const steps = [
    { number: 1, title: 'Shipping', icon: 'ri-map-pin-line' },
    { number: 2, title: 'Delivery', icon: 'ri-truck-line' },
    { number: 3, title: 'Payment', icon: 'ri-bank-card-line' }
  ];

  return (
    <ol className="flex items-center justify-between max-w-2xl mx-auto" aria-label="Checkout progress">
      {steps.map((step, index) => (
        <li key={step.number} className="flex items-center flex-1" aria-current={currentStep === step.number ? 'step' : undefined}>
          <div className="flex flex-col items-center flex-1">
            <div className={`w-12 h-12 flex items-center justify-center rounded-full font-bold transition-colors ${
              currentStep >= step.number
                ? 'bg-primary text-white'
                : 'bg-gray-200 text-gray-500'
            }`}>
              <i className={`${step.icon} text-xl`} aria-hidden="true"></i>
            </div>
            <p className={`mt-2 text-sm font-semibold ${
              currentStep >= step.number ? 'text-primary-dark' : 'text-gray-500'
            }`}>
              {step.title}
            </p>
          </div>
          {index < steps.length - 1 && (
            <div className={`h-0.5 flex-1 mx-4 transition-colors ${
              currentStep > step.number ? 'bg-primary' : 'bg-gray-200'
            }`} aria-hidden="true"></div>
          )}
        </li>
      ))}
    </ol>
  );
}
