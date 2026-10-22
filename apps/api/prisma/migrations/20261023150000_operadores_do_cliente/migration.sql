-- Os clientes que cada operador da Timeless atende. Sócio vê todos.
CREATE TABLE "operadores_do_cliente" (
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "operadores_do_cliente_pkey" PRIMARY KEY ("organization_id", "user_id")
);

CREATE INDEX "operadores_do_cliente_user_id_idx" ON "operadores_do_cliente"("user_id");

ALTER TABLE "operadores_do_cliente" ADD CONSTRAINT "operadores_do_cliente_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operadores_do_cliente" ADD CONSTRAINT "operadores_do_cliente_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
