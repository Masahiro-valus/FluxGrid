import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  VSCodeButton,
  VSCodeCheckbox,
  VSCodeDropdown,
  VSCodeOption,
  VSCodeTextField
} from "@vscode/webview-ui-toolkit/react";
import "./ConnectionDialog.css";
import { useI18n } from "../i18n";

export interface ConnectionFormValue {
  id?: string;
  name: string;
  driver: "postgres" | "mysql" | "sqlite";
  host: string;
  port: number;
  database: string;
  username?: string;
  password?: string;
  ssl: boolean;
  ssh: boolean;
}

type TestState = "idle" | "pending" | "success" | "error";

interface ConnectionDialogProps {
  open: boolean;
  initialValue?: Partial<ConnectionFormValue>;
  testState?: TestState;
  testMessage?: string;
  onTest?: (value: ConnectionFormValue) => void;
  onSaved: (value: ConnectionFormValue) => void;
  onClose: () => void;
}

const DEFAULT_FORM: ConnectionFormValue = {
  name: "",
  driver: "postgres",
  host: "localhost",
  port: 5432,
  database: "",
  username: "",
  password: "",
  ssl: false,
  ssh: false
};

export const ConnectionDialog: React.FC<ConnectionDialogProps> = ({
  open,
  initialValue,
  testState = "idle",
  testMessage,
  onTest,
  onSaved,
  onClose
}) => {
  const t = useI18n();
  const [form, setForm] = useState<ConnectionFormValue>(() => ({
    ...DEFAULT_FORM,
    ...initialValue
  }));
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setForm({
        ...DEFAULT_FORM,
        ...initialValue,
        ssl: initialValue?.ssl ?? false,
        ssh: initialValue?.ssh ?? false,
        port:
          initialValue?.port ??
          (initialValue?.driver === "mysql" ? 3306 : initialValue?.driver === "sqlite" ? 0 : 5432)
      });
      window.requestAnimationFrame(() => {
        firstFieldRef.current?.focus();
      });
    }
  }, [open, initialValue]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSaved(form);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  const isTestInProgress = testState === "pending";
  const testTone = testState === "success" ? "success" : testState === "error" ? "error" : "info";

  const driverOptions = useMemo(
    () => [
      { label: "PostgreSQL", value: "postgres" },
      { label: "MySQL", value: "mysql" },
      { label: "SQLite", value: "sqlite" }
    ],
    []
  );

  return (
    <dialog
      className="fg-connection-dialog"
      open={open}
      aria-modal="true"
      aria-labelledby="connection-dialog-title"
      onKeyDown={handleKeyDown}
    >
      <form className="fg-connection-dialog__form" onSubmit={handleSubmit}>
        <header className="fg-connection-dialog__header">
          <h2 id="connection-dialog-title">{t("connectionDialog.title")}</h2>
        </header>
        <section className="fg-connection-dialog__body">
          <VSCodeTextField
            ref={firstFieldRef}
            value={form.name}
            onInput={(event: React.ChangeEvent<HTMLInputElement>) =>
              setForm((prev) => ({ ...prev, name: event.target.value }))
            }
            required
            className="fg-field"
            aria-label={t("connectionDialog.name")}
            placeholder="Analytics Warehouse"
          >
            {t("connectionDialog.name")}
          </VSCodeTextField>
          <VSCodeDropdown
            value={form.driver}
            className="fg-field"
            aria-label={t("connectionDialog.driver")}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              const driver = event.target.value as ConnectionFormValue["driver"];
              setForm((prev) => ({
                ...prev,
                driver,
                port: driver === "mysql" ? 3306 : driver === "sqlite" ? 0 : 5432
              }));
            }}
          >
            {driverOptions.map((option) => (
              <VSCodeOption key={option.value} value={option.value}>
                {option.label}
              </VSCodeOption>
            ))}
          </VSCodeDropdown>

          <div className="fg-field-grid">
            <VSCodeTextField
              value={form.host}
              onInput={(event: React.ChangeEvent<HTMLInputElement>) =>
                setForm((prev) => ({ ...prev, host: event.target.value }))
              }
              required
              className="fg-field"
              aria-label={t("connectionDialog.host")}
            >
              {t("connectionDialog.host")}
            </VSCodeTextField>
            <VSCodeTextField
              value={form.port}
              type="number"
              onInput={(event: React.ChangeEvent<HTMLInputElement>) =>
                setForm((prev) => ({
                  ...prev,
                  port: Number(event.target.value)
                }))
              }
              className="fg-field"
              aria-label={t("connectionDialog.port")}
              required={form.driver !== "sqlite"}
              min={0}
            >
              {t("connectionDialog.port")}
            </VSCodeTextField>
          </div>

          {form.driver !== "sqlite" && (
            <VSCodeTextField
              value={form.database}
              onInput={(event: React.ChangeEvent<HTMLInputElement>) =>
                setForm((prev) => ({ ...prev, database: event.target.value }))
              }
              required
              className="fg-field"
              aria-label={t("connectionDialog.database")}
            >
              {t("connectionDialog.database")}
            </VSCodeTextField>
          )}

          <VSCodeTextField
            value={form.username ?? ""}
            onInput={(event: React.ChangeEvent<HTMLInputElement>) =>
              setForm((prev) => ({ ...prev, username: event.target.value }))
            }
            className="fg-field"
            aria-label={t("connectionDialog.user")}
          >
            {t("connectionDialog.user")}
          </VSCodeTextField>

          <VSCodeTextField
            value={form.password ?? ""}
            type="password"
            onInput={(event: React.ChangeEvent<HTMLInputElement>) =>
              setForm((prev) => ({ ...prev, password: event.target.value }))
            }
            className="fg-field"
            aria-label={t("connectionDialog.password")}
          >
            {t("connectionDialog.password")}
          </VSCodeTextField>

          <div className="fg-checkbox-row">
            <VSCodeCheckbox
              checked={form.ssl}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setForm((prev) => ({ ...prev, ssl: event.target.checked }))
              }
            >
              {t("connectionDialog.ssl")}
            </VSCodeCheckbox>
            <VSCodeCheckbox
              checked={form.ssh}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setForm((prev) => ({ ...prev, ssh: event.target.checked }))
              }
            >
              {t("connectionDialog.ssh")}
            </VSCodeCheckbox>
          </div>

          {testMessage && (
            <p
              className={`fg-connection-dialog__test-message fg-connection-dialog__test-message--${testTone}`}
            >
              {testMessage}
            </p>
          )}
        </section>
        <footer className="fg-connection-dialog__footer">
          <VSCodeButton appearance="secondary" onClick={() => onClose()} type="button">
            {t("connectionDialog.cancel")}
          </VSCodeButton>
          {onTest && (
            <VSCodeButton
              appearance="secondary"
              onClick={() => onTest(form)}
              disabled={isTestInProgress}
            >
              {isTestInProgress ? t("connectionDialog.testInProgress") : t("connectionDialog.test")}
            </VSCodeButton>
          )}
          <VSCodeButton type="submit" appearance="primary">
            {t("connectionDialog.save")}
          </VSCodeButton>
        </footer>
      </form>
    </dialog>
  );
};
