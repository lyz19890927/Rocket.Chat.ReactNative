import React from 'react';
import PropTypes from 'prop-types';
import { Platform, View, TextInput, FlatList } from 'react-native';
import { connect } from 'react-redux';
// import Icon from 'react-native-vector-icons/Ionicons';

import { iconsMap } from '../../Icons';
import database from '../../lib/realm';
import RocketChat from '../../lib/rocketchat';
import RoomItem from '../../presentation/RoomItem';
import styles from './styles';
import debounce from '../../utils/debounce';
import LoggedView from '../View';
import log from '../../utils/log';
import I18n from '../../i18n';

/** @extends React.Component */
class RoomsListView extends LoggedView {
	static propTypes = {
		navigator: PropTypes.object,
		user: PropTypes.object,
		Site_Url: PropTypes.string,
		server: PropTypes.string,
		searchText: PropTypes.string
	}

	constructor(props) {
		super('RoomsListView', props);

		this.state = {
			search: [],
			rooms: []
		};
		this.data = database.objects('subscriptions').filtered('archived != true && open == true').sorted('roomUpdatedAt', true);
		this.data.addListener(this.updateState);
		props.navigator.setOnNavigatorEvent(this.onNavigatorEvent.bind(this));
		props.navigator.setTitle({ title: 'Messages' });
	}

	async componentWillMount() {
		this.props.navigator.setButtons({
			leftButtons: [{
				id: 'sideMenu',
				icon: Platform.OS === 'ios' ? iconsMap['ios-menu'] : undefined
			}],
			rightButtons: [{
				id: 'createChannel',
				icon: iconsMap['ios-add']
			}]
		});
	}

	componentWillReceiveProps(props) {
		if (this.props.server !== props.server) {
			if (this.data) {
				this.data.removeListener(this.updateState);
				this.data = database.objects('subscriptions').filtered('archived != true && open == true').sorted('roomUpdatedAt', true);
				this.data.addListener(this.updateState);
			}
		} else if (this.props.searchText !== props.searchText) {
			this.search(props.searchText);
		}
	}

	componentWillUnmount() {
		this.updateState.stop();
		if (this.data) {
			this.data.removeAllListeners();
		}
	}

	onNavigatorEvent(event) {
		if (event.type === 'NavBarButtonPress') {
			if (event.id === 'createChannel') {
				this.props.navigator.push({
					screen: 'SelectedUsersView',
					passProps: {
						nextAction: 'CREATE_CHANNEL'
					}
				});
			} else if (event.id === 'sideMenu' && Platform.OS === 'ios') {
				this.props.navigator.toggleDrawer({
					side: 'left',
					animated: true,
					to: 'missing'
				});
			}
		}
	}

	onSearchChangeText(text) {
		this.search(text);
	}

	updateState = debounce(() => {
		this.setState({ rooms: this.data.slice() });
	})

	async search(text) {
		const searchText = text.trim();
		if (searchText === '') {
			delete this.oldPromise;
			return this.setState({
				search: []
			});
		}

		let data = database.objects('subscriptions').filtered('name CONTAINS[c] $0', searchText).slice(0, 7);

		const usernames = data.map(sub => sub.name);
		try {
			if (data.length < 7) {
				if (this.oldPromise) {
					this.oldPromise('cancel');
				}

				const { users, rooms } = await Promise.race([
					RocketChat.spotlight(searchText, usernames, { users: true, rooms: true }),
					new Promise((resolve, reject) => this.oldPromise = reject)
				]);

				data = data.concat(users.map(user => ({
					...user,
					rid: user.username,
					name: user.username,
					t: 'd',
					search: true
				})), rooms.map(room => ({
					rid: room._id,
					...room,
					search: true
				})));

				delete this.oldPromise;
			}
			this.setState({
				search: data
			});
		} catch (e) {
			// alert(JSON.stringify(e));
		}
	}

	goRoom = (rid, name) => {
		this.props.navigator.push({
			screen: 'RoomView',
			passProps: {
				room: { rid, name },
				rid,
				name
			}
		});
	}

	_onPressItem = async(item = {}) => {
		if (!item.search) {
			const { rid, name } = item;
			return this.goRoom(rid, name);
		}
		if (item.t === 'd') {
			// if user is using the search we need first to join/create room
			try {
				const { username } = item;
				const sub = await RocketChat.createDirectMessage(username);
				const { rid } = sub;
				return this.goRoom(rid, username);
			} catch (e) {
				log('RoomsListView._onPressItem', e);
			}
		} else {
			const { rid, name } = item;
			return this.goRoom(rid, name);
		}
	}

	renderSearchBar = () => (
		<View style={styles.searchBoxView}>
			<TextInput
				underlineColorAndroid='transparent'
				style={styles.searchBox}
				onChangeText={text => this.onSearchChangeText(text)}
				returnKeyType='search'
				placeholder={I18n.t('Search')}
				clearButtonMode='while-editing'
				blurOnSubmit
				autoCorrect={false}
				autoCapitalize='none'
				testID='rooms-list-view-search'
			/>
		</View>
	);

	renderItem = ({ item }) => {
		const id = item.rid.replace(this.props.user.id, '').trim();
		return (<RoomItem
			alert={item.alert}
			unread={item.unread}
			userMentions={item.userMentions}
			favorite={item.f}
			lastMessage={item.lastMessage}
			name={item.name}
			_updatedAt={item.roomUpdatedAt}
			key={item._id}
			id={id}
			type={item.t}
			baseUrl={this.props.Site_Url}
			onPress={() => this._onPressItem(item)}
			testID={`rooms-list-view-item-${ item.name }`}
		/>);
	}

	renderList = () => (
		<FlatList
			data={this.state.search.length > 0 ? this.state.search : this.state.rooms}
			extraData={this.state.search.length > 0 ? this.state.search : this.state.rooms}
			keyExtractor={item => item.rid}
			style={styles.list}
			renderItem={this.renderItem}
			ListHeaderComponent={Platform.OS === 'ios' ? this.renderSearchBar : null}
			contentOffset={Platform.OS === 'ios' ? { x: 0, y: 38 } : {}}
			enableEmptySections
			removeClippedSubviews
			keyboardShouldPersistTaps='always'
			testID='rooms-list-view-list'
		/>
	)

	render = () => (
		<View style={styles.container} testID='rooms-list-view'>
			{this.renderList()}
		</View>)
}

const mapStateToProps = state => ({
	user: state.login.user,
	server: state.server.server,
	Site_Url: state.settings.Site_Url,
	searchText: state.rooms.searchText
});

export default connect(mapStateToProps, null, null, { withRef: true })(RoomsListView);
