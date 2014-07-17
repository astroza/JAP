JAP - Just another P2P
=======
### Dependencies
* nodejs
* npm

### Install
```bash
git clone https://github.com/astroza/jap
cd jap
npm install
export JAP=$(pwd)
```
### Usage
```bash
mkdir $HOME/jap.data
cd $HOME/jap.data
```
#### First node (a root server)
```
node $JAP/server.js
```
#### Joining to network
```
node $JAP/server.js <server address> <rpc port>
```
**<server address>** and **<rpc port>** can belong to any network member. Just knowing a member is enough for joining.

Now, you can share files in **$HOME/jap.data/storage/share** directory.
