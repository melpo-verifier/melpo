# Melpo Verifier Discord Bot

A Discord verification bot that helps server administrators manage user access to your Discord server with a question based application.

## Features

- User verification system
- Customizable verification messages
- Database-backed configuration
- Automatic cleanup of old data
- Support for multiple bot listing APIs

A demo of Melpo Verifier in action:
![](https://iili.io/2U4PkWg.gif)

## Setup

### Prerequisites

- Node.js 16.x or higher
- PostgreSQL database (or other, so long they are supported by sequelize and are supported by the models)
- Discord bot token

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/melpo-verifier/melpo.git
   cd Melpo
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Rename `.env.example` to `.env`

4. Fill in the information in `.env`

5. Set up your database (preferably Postgresql, other databases may require parts of code to be adjusted) and update the connection details in `.env`

6. Start the bot:
   ```bash
   npm run start
   ```

## Development

For development with auto-restart:

```bash
npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the GNU Affero General Public License v3.0.  
See the [LICENSE](./LICENSE) file for details.

## Support

For support, join our [Discord server](https://discord.gg/jjGAwwwxZz) or open an issue on GitHub.
