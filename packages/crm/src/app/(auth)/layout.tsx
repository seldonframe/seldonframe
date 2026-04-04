import Image from "next/image";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="crm-page flex items-center justify-center">
      <div className="crm-card w-full max-w-md p-6">
        <div>
          <Image src="/logo.svg" alt="SeldonFrame logo" width={40} height={40} priority />
        </div>
        {children}
      </div>
    </div>
  );
}
