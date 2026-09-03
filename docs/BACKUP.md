# Cópia de segurança do banco

## O que roda sozinho

O serviço `backup` do Docker Compose faz uma cópia por dia e guarda as últimas
trinta. Os arquivos ficam no volume `backups`, fora dos contêineres da
aplicação, então recriar a API ou o worker não os afeta.

Ele usa a imagem do Postgres em vez de uma tarefa dentro da API. Assim o
`pg_dump` é exatamente da mesma versão do servidor, nenhuma imagem da
aplicação precisa carregar o cliente de banco, e a cópia continua acontecendo
mesmo se a API estiver fora do ar.

A cópia é escrita num nome temporário e só renomeada no fim. Sem isso, uma
queda no meio deixaria um arquivo truncado com cara de cópia boa, e a
descoberta aconteceria justamente na hora de restaurar.

## Ver o que existe

```bash
docker compose exec backup ls -lh /backups
```

## Fazer uma cópia agora

Antes de uma migração ou de qualquer mudança arriscada:

```bash
docker compose exec backup sh /scripts/backup.sh uma-vez
```

## Restaurar

> Restaurar no banco atual **substitui o que está lá**. Faça uma cópia nova
> antes, mesmo que o banco pareça perdido: ele pode conter algo que a cópia
> antiga não tem.

Primeiro restaure numa base separada e confira. É o passo que separa uma
restauração de um segundo acidente:

```bash
docker compose exec backup sh /scripts/restaurar.sh /backups/tintim-AAAAMMDD-HHMMSS.sql.gz conferencia
docker compose exec postgres psql -U tintim -d conferencia -c "select count(*) from leads;"
```

Conferido, restaure no banco de verdade:

```bash
docker compose exec backup sh /scripts/restaurar.sh /backups/tintim-AAAAMMDD-HHMMSS.sql.gz
docker compose restart api worker
```

Reiniciar a API e o worker é necessário porque o Prisma mantém conexões
abertas com o banco antigo.

Depois, apague a base de conferência:

```bash
docker compose exec postgres psql -U tintim -d tintim -c "DROP DATABASE conferencia;"
```

## Tirar uma cópia para fora da máquina

O volume vive no mesmo disco do banco. Isso protege contra apagar dados por
engano, e **não** protege contra o disco morrer. Para levar uma cópia para
fora:

```bash
docker compose cp backup:/backups ./backups-local
```

## Limitações conhecidas

- **A cópia fica na mesma máquina.** Enviar para armazenamento externo depende
  de credenciais que o produto ainda não tem. Enquanto isso, o comando acima
  precisa ser rodado à mão, ou por uma tarefa do sistema operacional.
- **As imagens enviadas não entram na cópia.** As logos ficam no volume
  `uploads` e são copiadas à parte:
  ```bash
  docker compose cp api:/app/uploads ./uploads-local
  ```
- **A restauração foi testada em 3 de setembro de 2026**, restaurando numa base
  separada e comparando as contagens de leads, mensagens e organizações. Repita
  esse teste de tempos em tempos: uma cópia que nunca foi restaurada é uma
  esperança, não uma cópia.
