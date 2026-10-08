## LLM Router: запросы и ответы

Дашборд `Application → LLM Router — запросы и ответы` читает
`public.llm_invocations` напрямую из PostgreSQL. Таблица должна уже существовать
в БД мониторинга LLM; эта задача не создаёт таблицы и не меняет backend.

В окружении Docker Compose задайте подключение к этой БД:

```dotenv
GRAFANA_LLM_DB_URL=postgres:5432
GRAFANA_LLM_DB_NAME=postgres
GRAFANA_LLM_DB_USER=grafana_llm_reader
GRAFANA_LLM_DB_PASSWORD=<пароль отдельного пользователя БД>
GRAFANA_LLM_DB_SSL_MODE=require
```

Для локального PostgreSQL без TLS используйте `GRAFANA_LLM_DB_SSL_MODE=disable`.
В контейнере адрес `localhost` указывает на саму Grafana, а не на PostgreSQL.
Пароли храните в локальном env или секретах окружения, не в Git.

Администратор БД должен создать пользователя только для чтения. В `psql`,
подключённом к нужной БД, достаточно выполнить:

```sql
CREATE USER grafana_llm_reader;
\password grafana_llm_reader
GRANT USAGE ON SCHEMA public TO grafana_llm_reader;
GRANT SELECT ON public.llm_invocations TO grafana_llm_reader;
```

После настройки пересоздайте Grafana, используя свой обычный env для Compose:

```sh
docker compose up -d --no-deps grafana-ai
```

Выберите период и нажмите «Открыть» у нужного обращения. Панели Input и Output
читают одну запись по её `id`, не по `request_id`: у одного HTTP-запроса может
быть несколько вызовов LLM. В списке показаны последние 500 записей за период;
для остальных сузьте или сдвиньте период. Полный JSON доступен через просмотр
значения ячейки, без обрезания. При `failed` рядом с ответом показана ошибка.

LangSmith используется только как референс «список обращений → Input / Output».
Его API, новые ручки backend и плагины Grafana не нужны. Ограничьте доступ к
Grafana: запросы и ответы могут содержать пользовательские данные.

## Alerting rules

### Критические ошибки в сервисе `backend`

```logql
sum(count_over_time({container_name="backend"} |= "ERROR" |~ "(?i)(exception|failed|panic)" [5m]))
```

 - **Condition:** `>3` (больше 3 ошибок за 5 минут)
 - **For:** 2m (чтобы избежать шума в алертах)
 - Severity: Critical

 ### Высокий eror rate для 5xx ошибок

 ```logql
 sum(rate({container_name="backend"} |~ "status=5\\d{2}" [5m])) > 0.05
 ```

 ### Паники / Fatal

 ```
 count_over_time({container_name="backend"} |= "FATAL" [10m]) > 0
 ```

 ### Нет логов от сервиса (heartbeat)

 ```logql
 absent_over_time({container_name="backend"} [10m])
 ```

