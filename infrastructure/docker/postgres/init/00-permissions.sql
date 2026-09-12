-- Postgres 15+ deixou de conceder CREATE no schema "public" por padrao,
-- mesmo para o dono do banco. O Prisma precisa de CREATE para aplicar
-- migrations e para criar o shadow database usado na validacao.
-- Sem isto, "prisma migrate dev" falha com P1010.

GRANT ALL ON SCHEMA public TO CURRENT_USER;
ALTER SCHEMA public OWNER TO CURRENT_USER;
ALTER USER CURRENT_USER CREATEDB;
