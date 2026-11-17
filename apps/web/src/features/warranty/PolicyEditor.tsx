import type { FormEvent, ReactNode } from "react";

export function PolicyEditor({ onSubmit, children }: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; children: ReactNode;
}) {
  return <form className="w-form" onSubmit={onSubmit}>{children}</form>;
}
