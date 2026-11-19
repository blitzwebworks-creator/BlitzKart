type PolicySection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  closing?: string[];
};

type PolicyDocument = {
  title: string;
  introduction?: string;
  sections: PolicySection[];
  contactHeading: string;
};

const lastUpdated = "19 November 2026";

const policies: Record<string, PolicyDocument> = {
  privacy: {
    title: "Privacy Policy",
    introduction: "At BlitzKart, we respect your privacy and are committed to protecting your personal information.",
    sections: [
      { heading: "1. Information We Collect", paragraphs: ["When you use BlitzKart, we may collect:"], bullets: ["Full name", "Email address", "Mobile number", "Billing and delivery address", "Order history", "Payment transaction references", "Device and website usage information"] },
      { heading: "2. How We Use Your Information", paragraphs: ["We use collected information to:"], bullets: ["Process and deliver orders.", "Provide customer support.", "Send order confirmations and updates.", "Process refunds and cancellations.", "Prevent fraudulent transactions.", "Improve our website and services."] },
      { heading: "3. Payment Information", paragraphs: ["Payments are processed through authorised third-party payment providers, such as Razorpay.", "BlitzKart does not store customers' complete debit card, credit card or UPI credentials on its servers."] },
      { heading: "4. Sharing of Information", paragraphs: ["We may share necessary information with:"], bullets: ["Delivery and logistics partners.", "Payment gateway providers.", "Website hosting and technology providers.", "Government or legal authorities when required by law."], closing: ["We do not sell customers' personal information."] },
      { heading: "5. Cookies", paragraphs: ["Our website may use cookies and similar technologies to improve functionality, remember preferences and understand website usage."] },
      { heading: "6. Data Security", paragraphs: ["We take reasonable technical and organisational measures to protect customer information against unauthorised access, misuse or disclosure."] },
      { heading: "7. Customer Rights", paragraphs: ["Customers may request access, correction or deletion of their personal information, subject to applicable legal and record-retention requirements."] },
      { heading: "8. Children's Privacy", paragraphs: ["Our services are not specifically directed towards children. Users who are not legally competent to enter into contracts should use the services with appropriate parental or guardian involvement."] },
      { heading: "9. Policy Updates", paragraphs: ["BlitzKart reserves the right to update this Privacy Policy. Changes will be published on this page."] },
    ],
    contactHeading: "10. Contact Us",
  },
  terms: {
    title: "Terms & Conditions",
    introduction: "Welcome to BlitzKart. By accessing or purchasing from our website, you agree to the following Terms & Conditions.",
    sections: [
      { heading: "1. General", paragraphs: ["BlitzKart operates as an online shopping platform offering products across various categories.", "By using our website, you agree to comply with these terms and applicable Indian laws."] },
      { heading: "2. Account Registration", paragraphs: ["Customers are responsible for:"], bullets: ["Providing accurate registration information.", "Maintaining account security.", "Keeping their login credentials confidential.", "Ensuring that their account information remains updated."] },
      { heading: "3. Product Information", paragraphs: ["We make reasonable efforts to display accurate product descriptions, images, specifications and prices.", "Minor variations in product appearance, packaging or availability may occur."] },
      { heading: "4. Pricing and Payments", bullets: ["All prices are displayed in Indian Rupees (INR).", "Applicable taxes and additional charges will be displayed where required.", "Payments must be completed through available payment methods.", "Orders are subject to successful payment verification."] },
      { heading: "5. Order Acceptance", paragraphs: ["Placing an order does not automatically guarantee acceptance.", "BlitzKart reserves the right to cancel orders in cases involving:"], bullets: ["Product unavailability.", "Pricing or listing errors.", "Suspected fraudulent activity.", "Incorrect customer information.", "Operational or delivery restrictions."], closing: ["Any eligible refund will be processed according to our Refund Policy."] },
      { heading: "6. Delivery", paragraphs: ["Delivery services depend on the customer's PIN code and service availability.", "BlitzKart may offer Blitz Delivery (same-day delivery) and Standard Delivery (estimated 2–4 days). Actual delivery timelines may vary."] },
      { heading: "7. Customer Responsibilities", paragraphs: ["Customers must provide accurate contact and delivery details and ensure that someone is available to receive the order."] },
      { heading: "8. Intellectual Property", paragraphs: ["All website content, branding, logos, graphics and original materials belonging to BlitzKart may not be reproduced without permission."] },
      { heading: "9. Limitation of Liability", paragraphs: ["BlitzKart shall not be responsible for delays or service interruptions beyond its reasonable control, subject to applicable consumer protection laws.", "Nothing in these terms excludes rights or remedies that cannot legally be excluded."] },
      { heading: "10. Changes to Terms", paragraphs: ["BlitzKart may update these terms from time to time. Updated terms will be published on this page."] },
      { heading: "11. Governing Law", paragraphs: ["These terms are governed by the laws of India, subject to applicable consumer protection legislation."] },
    ],
    contactHeading: "12. Contact Us",
  },
  refund: {
    title: "Refund Policy",
    introduction: "At BlitzKart, customer satisfaction is important to us. This policy explains how refunds are handled.",
    sections: [
      { heading: "1. Refund Eligibility", paragraphs: ["Customers may be eligible for a refund in situations including:"], bullets: ["Order cancellation before dispatch.", "Order cancellation by BlitzKart.", "Product unavailable after payment.", "Wrong product delivered.", "Product received in damaged condition.", "Approved returns under our Return & Exchange Policy.", "Payment deducted without successful order confirmation."] },
      { heading: "2. Refund Approval", paragraphs: ["All refund requests are reviewed by our support team.", "Customers may be asked to provide:"], bullets: ["Order ID.", "Registered mobile number.", "Payment reference or transaction ID.", "Product photographs or other supporting information, where relevant."] },
      { heading: "3. Refund Processing Time", paragraphs: ["Once approved:"], bullets: ["Refunds will generally be initiated within 2–3 business days.", "Actual credit time depends on the payment provider and customer's bank.", "Refunds will normally be sent to the original payment method."] },
      { heading: "4. Failed Transactions", paragraphs: ["If payment is deducted but the order is not successfully created, customers should contact our support team.", "We will verify the transaction and assist with the refund where applicable."] },
      { heading: "5. Refund Limitations", paragraphs: ["Refunds will be assessed according to the product condition, reason for the request and applicable consumer protection requirements.", "Nothing in this policy limits statutory consumer rights."] },
      { heading: "6. Delivery Charges", paragraphs: ["Delivery and other additional charges will be reviewed according to the reason for the refund and applicable consumer protection requirements."] },
      { heading: "7. Refund Status", paragraphs: ["Customers can contact support to check their refund status."] },
    ],
    contactHeading: "8. Contact Us",
  },
  returns: {
    title: "Return & Exchange Policy",
    introduction: "BlitzKart aims to ensure that customers receive the products they ordered in satisfactory condition.",
    sections: [
      { heading: "1. Return Eligibility", paragraphs: ["Customers may request a return or exchange if:"], bullets: ["The wrong product was delivered.", "The product arrived damaged.", "The product has a manufacturing defect.", "The product received significantly differs from its description.", "Another legally recognised return ground applies."] },
      { heading: "2. Return Request Period", paragraphs: ["Customers should report damaged, defective or incorrect products within 48 hours of delivery.", "This reporting period helps us investigate the issue. It does not remove any statutory consumer rights."] },
      { heading: "3. Required Information", paragraphs: ["Customers may need to provide:"], bullets: ["Order ID.", "Product name.", "Description of the issue.", "Photographs or videos showing the issue.", "Registered mobile number."] },
      { heading: "4. Exchange", paragraphs: ["Where an exchange is approved:"], bullets: ["A replacement may be arranged subject to stock availability.", "If the replacement is unavailable, an appropriate refund may be provided.", "Customers will be informed about the next steps."] },
      { heading: "5. Non-Returnable Products", paragraphs: ["Certain products may have category-specific return restrictions, particularly:"], bullets: ["Personal-use products.", "Hygiene-sensitive products.", "Products specifically customised for customers.", "Products damaged due to customer misuse."], closing: ["These restrictions do not apply where a return, replacement or refund is required by law."] },
      { heading: "6. Return Pickup", paragraphs: ["Where applicable, BlitzKart may arrange a return pickup through an available delivery partner.", "Customers may also be provided with alternative return instructions."] },
      { heading: "7. Inspection", paragraphs: ["Returned products may be inspected to verify the reported issue."] },
      { heading: "8. Refunds", paragraphs: ["Approved refunds will be handled according to our Refund Policy."] },
    ],
    contactHeading: "9. Contact Us",
  },
  shipping: {
    title: "Shipping & Delivery Policy",
    introduction: "BlitzKart offers delivery services depending on customer location, PIN code and operational availability.",
    sections: [
      { heading: "1. Available Delivery Services", paragraphs: ["A. Blitz Delivery", "Same-day delivery.", "Available only in supported locations and PIN codes.", "Operating hours: 10:00 AM – 10:00 PM.", "Orders placed outside operating hours may be eligible for Standard Delivery.", "B. Standard Delivery", "Estimated delivery: 2–4 business days.", "Available in supported serviceable locations.", "Delivery timelines may vary depending on destination and logistics availability."] },
      { heading: "2. Delivery Availability", paragraphs: ["Delivery availability depends on:"], bullets: ["Customer PIN code.", "Product availability.", "Delivery partner availability.", "Operational hours.", "Weather and other unforeseen circumstances."], closing: ["BlitzKart may enable or disable specific delivery services for selected PIN codes."] },
      { heading: "3. Shipping Charges", paragraphs: ["Applicable shipping charges will be displayed during checkout.", "Additional charges, if any, such as packaging or handling fees, will be disclosed before order confirmation."] },
      { heading: "4. Order Processing", paragraphs: ["Orders are processed after successful payment verification or confirmation through an available payment method.", "Processing times may vary depending on order volume and product availability."] },
      { heading: "5. Tracking", paragraphs: ["Where tracking is available, customers may receive tracking information through available communication channels."] },
      { heading: "6. Delivery Attempts", paragraphs: ["Customers should provide accurate delivery information and remain available to receive their orders.", "If delivery cannot be completed, another attempt or further instructions may be arranged."] },
      { heading: "7. Delivery Delays", paragraphs: ["Delivery estimates are not guaranteed. Delays may occur due to:"], bullets: ["Weather conditions.", "Traffic restrictions.", "Logistics disruptions.", "Incorrect delivery details.", "Unforeseen operational circumstances."] },
      { heading: "8. Incorrect Address", paragraphs: ["Customers should contact support immediately if they identify an incorrect delivery address.", "Address changes may not be possible once an order has been dispatched."] },
    ],
    contactHeading: "9. Contact Us",
  },
  cancellation: {
    title: "Cancellation Policy",
    introduction: "BlitzKart understands that customers may occasionally need to cancel their orders.",
    sections: [
      { heading: "1. Customer Cancellation", paragraphs: ["Customers may request cancellation before their order is dispatched.", "Cancellation requests can be submitted through:"], bullets: ["Customer support email.", "Available website support channels.", "Official customer support phone number."] },
      { heading: "2. Orders Already Dispatched", paragraphs: ["Once an order has been dispatched, cancellation may not be possible through the normal cancellation process.", "Customers should contact support for assistance.", "This does not affect any applicable statutory cancellation or return rights."] },
      { heading: "3. Cancellation by BlitzKart", paragraphs: ["BlitzKart may cancel an order in situations such as:"], bullets: ["Product unavailability.", "Incorrect product pricing.", "Payment verification failure.", "Suspected fraudulent transactions.", "Delivery service unavailability.", "Other legitimate operational reasons."] },
      { heading: "4. Refund for Cancelled Orders", paragraphs: ["If an order is successfully cancelled after payment:"], bullets: ["The refund will generally be initiated within 2–3 business days.", "Refunds will normally be processed through the original payment method.", "Actual credit time depends on the payment provider and bank."] },
      { heading: "5. Partial Cancellation", paragraphs: ["If an order contains multiple products, customers may request cancellation of individual items before dispatch, subject to order-processing limitations."] },
      { heading: "6. Failed Delivery", paragraphs: ["If an order cannot be delivered, BlitzKart may contact the customer to arrange another delivery attempt or resolve the issue.", "Any RTO-related charges or deductions will be handled transparently and in accordance with applicable law. No automatic deduction will override statutory consumer rights."] },
    ],
    contactHeading: "7. Contact Us",
  },
};

export function PolicyPage({ policy }: { policy: keyof typeof policies }) {
  const document = policies[policy];
  return <div className="wrap policy-wrap">
    <header className="policy-heading">
      <span className="section-kicker">BLITZKART · LEGAL</span>
      <h1 className="page-title">{document.title}</h1>
      <p className="policy-updated">Last Updated: {lastUpdated}</p>
    </header>
    <article className="panel policy-document">
      {document.introduction ? <p className="policy-introduction">{document.introduction}</p> : null}
      {document.sections.map((section) => <section className="policy-section" key={section.heading}>
        <h2>{section.heading}</h2>
        {section.paragraphs?.map((paragraph, index) => <p key={`${section.heading}-p-${index}`}>{paragraph}</p>)}
        {section.bullets ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
        {section.closing?.map((paragraph, index) => <p key={`${section.heading}-closing-${index}`}>{paragraph}</p>)}
      </section>)}
      <section className="policy-section policy-contact">
        <h2>{document.contactHeading}</h2>
        <p><strong>Business:</strong> BlitzKart</p>
        <p><strong>Email:</strong> <a href="mailto:blitzkart2026@gmail.com">blitzkart2026@gmail.com</a></p>
        <p><strong>Phone:</strong> <a href="tel:+918506006599">+91 8506006599</a></p>
        <p><strong>Website:</strong> <a href="https://www.blitzkart.store">blitzkart.store</a></p>
      </section>
    </article>
  </div>;
}

export type { PolicyDocument, PolicySection };
